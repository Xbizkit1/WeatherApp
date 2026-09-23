import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const weatherCopy = (code) => {
  if (code === 0) return ['Clear sky', '☀️'];
  if ([1, 2].includes(code)) return ['Mostly sunny', '🌤️'];
  if (code === 3) return ['Cloudy', '☁️'];
  if ([45, 48].includes(code)) return ['Misty', '🌫️'];
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return ['Light rain', '🌦️'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snowy', '❄️'];
  if ([95, 96, 99].includes(code)) return ['Thunderstorms', '⛈️'];
  return ['Partly cloudy', '🌤️'];
};

async function findPlaces(query, count = 8) {
  const trimmed = query.trim();
  const commaParts = trimmed.split(',').map(part => part.trim()).filter(Boolean);
  const words = trimmed.split(/\s+/).filter(Boolean);
  const terms = commaParts.length > 1
    ? [commaParts[0]]
    : [trimmed, ...Array.from({ length: Math.max(0, words.length - 1) }, (_, index) => words.slice(0, words.length - index - 1).join(' '))];

  for (const term of [...new Set(terms)]) {
    if (term.length < 2) continue;
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=${count}&language=en&format=json`);
    if (!response.ok) throw new Error('Place search failed');
    const result = await response.json();
    if (result.results?.length) {
      const contextWords = trimmed.toLowerCase().split(/[\s,]+/).filter(word => word.length > 2);
      return result.results.sort((a, b) => {
        const detailsA = [a.name, a.admin1, a.admin2, a.admin3, a.admin4, a.country].filter(Boolean).join(' ').toLowerCase();
        const detailsB = [b.name, b.admin1, b.admin2, b.admin3, b.admin4, b.country].filter(Boolean).join(' ').toLowerCase();
        const score = details => contextWords.reduce((total, word) => total + (details.includes(word) ? 1 : 0), 0);
        return score(detailsB) - score(detailsA);
      });
    }
  }
  return [];
}

function placeDetails(place) {
  return [...new Set([place.admin4, place.admin3, place.admin2, place.admin1, place.country]
    .filter(Boolean)
    .filter(value => value.toLowerCase() !== place.name?.toLowerCase()))]
    .join(', ');
}

async function fetchWeather(city) {
  let matches;
  try {
    matches = await findPlaces(city, 10);
  } catch {
    throw new Error('Could not connect. Check your internet and try again.');
  }
  const place = matches[0];
  if (!place) throw new Error(`We couldn't find “${city}”. Try another city or choose a suggestion.`);
  return fetchWeatherAtCoordinates(place.latitude, place.longitude, place);
}

async function fetchWeatherAtCoordinates(latitude, longitude, place) {
  const query = new URLSearchParams({ latitude, longitude, current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,uv_index', daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset', timezone: 'auto', forecast_days: '5' });
  const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!weatherResponse.ok) throw new Error('Weather is unavailable right now. Please try again.');
  return { place, data: await weatherResponse.json() };
}

function GlassCard({ children, style }) {
  return (
    <BlurView intensity={78} tint="light" style={[styles.glass, style]}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.20)', 'rgba(186,255,225,0.28)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {children}
    </BlurView>
  );
}

export default function WeatherScreen() {
  const [cityInput, setCityInput] = useState('');
  const [places, setPlaces] = useState([]);
  const [isFindingPlaces, setIsFindingPlaces] = useState(false);
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const inputRef = useRef(null);
  const requestId = useRef(0);
  const placesRequestId = useRef(0);

  useEffect(() => {
    const query = cityInput.trim();
    const request = ++placesRequestId.current;
    if (query.length < 2) {
      setPlaces([]);
      setIsFindingPlaces(false);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setIsFindingPlaces(true);
      try {
        const results = await findPlaces(query, 8);
        if (request === placesRequestId.current) {
          setPlaces(results);
        }
      } catch {
        if (request === placesRequestId.current) setPlaces([]);
      } finally {
        if (request === placesRequestId.current) setIsFindingPlaces(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cityInput]);

  const search = async (requestedCity) => {
    const city = requestedCity.trim();
    if (!city) {
      setError('Enter a city to see its weather.');
      setStatus(weather ? 'success' : 'empty');
      return;
    }
    Keyboard.dismiss();
    setIsLocating(false);
    setPlaces([]);
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setError('');
    try {
      const result = await fetchWeather(city);
      if (currentRequest !== requestId.current) return;
      setWeather(result);
      setCityInput('');
      setStatus('success');
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setError(e.message || 'Something went wrong. Please try again.');
      setStatus(weather ? 'success' : 'error');
    }
  };

  const choosePlace = async (place) => {
    Keyboard.dismiss();
    setPlaces([]);
    setIsLocating(false);
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setError('');
    try {
      const result = await fetchWeatherAtCoordinates(place.latitude, place.longitude, place);
      if (currentRequest !== requestId.current) return;
      setWeather(result);
      setCityInput('');
      setStatus('success');
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setCityInput(place.name);
      setError(e.message || 'Weather is unavailable right now. Please try again.');
      setStatus(weather ? 'success' : 'error');
    }
  };

  const locateMe = async () => {
    Keyboard.dismiss();
    setPlaces([]);
    const currentRequest = ++requestId.current;
    setIsLocating(true);
    setStatus('loading');
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Location permission was not granted. You can still search for a city.');
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;
      let place = { name: 'Your location', admin1: '', country: '' };
      if (Platform.OS !== 'web') {
        try {
          const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
          if (address) {
            place = {
              name: address.city || address.district || address.subregion || 'Your location',
              admin1: address.region || address.subregion || '',
              country: address.country || '',
            };
          }
        } catch {
          // Weather still works from coordinates when reverse geocoding is unavailable.
        }
      }
      const result = await fetchWeatherAtCoordinates(latitude, longitude, place);
      if (currentRequest !== requestId.current) return;
      setWeather(result);
      setCityInput('');
      setStatus('success');
    } catch (e) {
      if (currentRequest !== requestId.current) return;
      setError(e.message || 'Could not get your location. Please try searching for a city.');
      setStatus(weather ? 'success' : 'error');
    } finally {
      if (currentRequest === requestId.current) setIsLocating(false);
    }
  };

  useEffect(() => { search('Manila'); }, []);

  const current = weather?.data.current;
  const daily = weather?.data.daily;
  const [condition, emoji] = current ? weatherCopy(current.weather_code) : ['Your forecast awaits', '☀️'];
  const dateLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  return (
    <LinearGradient colors={['#74d8f3', '#b9f0ed', '#dff8d3', '#9fe5c2']} locations={[0, 0.34, 0.72, 1]} style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View pointerEvents="none" style={styles.sky}>
        <LinearGradient colors={['rgba(91, 230, 255, 0.5)', 'transparent']} style={styles.orbOne} />
        <LinearGradient colors={['rgba(164, 250, 115, 0.4)', 'transparent']} style={styles.orbTwo} />
        <View style={styles.horizon} />
        <View style={styles.bubbleOne} /><View style={styles.bubbleTwo} /><View style={styles.bubbleThree} />
        <View style={styles.bubbleFour} /><View style={styles.bubbleFive} />
        <View style={styles.cloudOne}><View style={styles.cloudPuffA} /><View style={styles.cloudPuffB} /></View>
        <View style={styles.cloudTwo}><View style={styles.cloudPuffC} /><View style={styles.cloudPuffD} /></View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.brandMark}><Text style={styles.brandSun}>☼</Text></View>
          <View><Text style={styles.brand}>AEROCAST</Text><Text style={styles.brandSub}>A little sunshine, wherever you are</Text></View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>YOUR PERSONAL SKY REPORT</Text>
          <Text style={styles.headline}>Hello, Sunshine.</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput ref={inputRef} style={styles.searchInput} value={cityInput} onChangeText={setCityInput} onSubmitEditing={() => search(cityInput)} placeholder="Search any city worldwide..." placeholderTextColor="#83aeb2" returnKeyType="search" autoCapitalize="words" accessibilityLabel="Search cities worldwide" />
            {cityInput.length > 0 && <Pressable onPress={() => setCityInput('')} hitSlop={8} accessibilityLabel="Clear search"><Text style={styles.clearText}>×</Text></Pressable>}
          </View>
          <Pressable style={({ pressed }) => [styles.searchButtonWrap, pressed && styles.pressed]} onPress={() => search(cityInput)} accessibilityRole="button" accessibilityLabel="Search weather">
            <LinearGradient colors={['#7ae642', '#3bb889']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.searchButton}>
              <View style={styles.buttonGloss} />
              <Text style={styles.searchButtonText}>Search</Text><Text style={styles.arrow}>↗</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {(places.length > 0 || isFindingPlaces || cityInput.trim().length >= 2) && <View style={styles.suggestions}>
          {isFindingPlaces ? <View style={styles.suggestionStatus}><ActivityIndicator size="small" color="#168f8e" /><Text style={styles.suggestionStatusText}>Finding places worldwide…</Text></View> : places.length > 0 ? places.map((place, index) => (
            <Pressable key={`${place.id || place.name}-${place.latitude}`} onPress={() => choosePlace(place)} style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed, index === places.length - 1 && styles.suggestionLast]} accessibilityRole="button" accessibilityLabel={`Select ${place.name}, ${place.admin1 || place.country}`}>
              <View style={styles.suggestionPin}><Text style={styles.suggestionPinText}>⌖</Text></View>
              <View style={styles.suggestionCopy}><Text style={styles.suggestionName}>{place.name}</Text><Text style={styles.suggestionRegion}>{placeDetails(place)}</Text></View>
              <Text style={styles.suggestionChevron}>›</Text>
            </Pressable>
          )) : <View style={styles.suggestionStatus}><Text style={styles.suggestionStatusText}>No matching cities or municipalities found.</Text></View>}
        </View>}

        <Pressable style={({ pressed }) => [styles.locateButtonWrap, pressed && styles.pressed, isLocating && styles.locateBusy]} onPress={locateMe} disabled={isLocating} accessibilityRole="button" accessibilityLabel="Use my current location">
          <BlurView intensity={40} tint="light" style={styles.locateButton}>
            {isLocating ? <ActivityIndicator size="small" color="#168f8e" /> : <Text style={styles.locateIcon}>◎</Text>}
            <Text style={styles.locateText}>{isLocating ? 'Finding your location…' : 'Use my current location'}</Text>
            {!isLocating && <Text style={styles.locateArrow}>↗</Text>}
          </BlurView>
        </Pressable>

        {status === 'loading' && weather ? <View style={styles.refreshing}><ActivityIndicator size="small" color="#008f95" /><Text style={styles.refreshingText}>Updating forecast…</Text></View> : null}
        {error ? <View style={styles.notice}><Text style={styles.noticeIcon}>ⓘ</Text><Text style={styles.noticeText}>{error}</Text><Pressable onPress={() => search(cityInput || weather?.place.name || 'Manila')}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}

        {status === 'loading' && !weather ? (
          <GlassCard style={styles.loadingCard}><ActivityIndicator size="large" color="#008f95" /><Text style={styles.loadingText}>Finding your little patch of sky…</Text></GlassCard>
        ) : status === 'error' && !weather ? (
          <GlassCard style={styles.emptyCard}><Text style={styles.emptyEmoji}>🌦️</Text><Text style={styles.emptyTitle}>The sky is out of reach</Text><Text style={styles.emptyCopy}>{error}</Text>
            <Pressable style={({pressed}) => [styles.tryButtonWrap, pressed && styles.pressed]} onPress={() => inputRef.current?.focus()}>
              <LinearGradient colors={['#7ae642', '#3bb889']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.tryButton}>
                <View style={styles.buttonGloss} />
                <Text style={styles.tryText}>Try a city</Text>
              </LinearGradient>
            </Pressable>
          </GlassCard>
        ) : weather ? (
          <>
            <GlassCard style={styles.heroCard}>
              <View style={styles.cardShine} />
              <View style={styles.heroHeading}><View><Text style={styles.locationLabel}>CURRENT WEATHER</Text><Text style={styles.city}>{weather.place.name}<Text style={styles.pin}>  ⌖</Text></Text><Text style={styles.region}>{placeDetails(weather.place)}</Text></View><View style={styles.sunBadge}><Text style={styles.sunGlyph}>✦</Text></View></View>
              <View style={styles.weatherMain}><View><Text style={styles.temperature}>{Math.round(current.temperature_2m)}°</Text><Text style={styles.feels}>Feels like {Math.round(current.apparent_temperature)}°</Text></View><View style={styles.weatherIconWrap}><Text style={styles.weatherIcon}>{emoji}</Text></View></View>
              <View style={styles.conditionRow}><View style={styles.conditionDot} /><Text style={styles.condition}>{condition}</Text><Text style={styles.highLow}>H:{Math.round(daily.temperature_2m_max[0])}°  L:{Math.round(daily.temperature_2m_min[0])}°</Text></View>
              <View style={styles.divider} />
              <View style={styles.detailsRow}>
                <View style={styles.detail}><View style={styles.detailIcon}><Text>◌</Text></View><View><Text style={styles.detailLabel}>HUMIDITY</Text><Text style={styles.detailValue}>{current.relative_humidity_2m}<Text style={styles.detailUnit}>%</Text></Text></View></View>
                <View style={styles.detailDivider} />
                <View style={styles.detail}><View style={styles.detailIcon}><Text>↗</Text></View><View><Text style={styles.detailLabel}>WIND SPEED</Text><Text style={styles.detailValue}>{Math.round(current.wind_speed_10m)}<Text style={styles.detailUnit}> km/h</Text></Text></View></View>
                <View style={styles.detailDivider} />
                <View style={styles.detail}><View style={styles.detailIcon}><Text>☀</Text></View><View><Text style={styles.detailLabel}>UV INDEX</Text><Text style={styles.detailValue}>{current.uv_index ?? '—'}<Text style={styles.detailUnit}> / 11</Text></Text></View></View>
              </View>
            </GlassCard>

            <View style={styles.forecastHeading}><View><Text style={styles.forecastTitle}>The next few days</Text><Text style={styles.forecastCaption}>A little look ahead</Text></View><Text style={styles.forecastSun}>✧</Text></View>
            <View style={styles.forecastRow}>{daily.time.slice(1, 5).map((day, i) => {
              const [, dayEmoji] = weatherCopy(daily.weather_code[i + 1]);
              const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day}T12:00:00`));
              return <GlassCard style={styles.forecastCard} key={day}><Text style={styles.forecastDay}>{weekday}</Text><Text style={styles.forecastIcon}>{dayEmoji}</Text><Text style={styles.forecastHigh}>{Math.round(daily.temperature_2m_max[i + 1])}°</Text><Text style={styles.forecastLow}>{Math.round(daily.temperature_2m_min[i + 1])}°</Text><Text style={styles.rainChance}>{daily.precipitation_probability_max?.[i + 1] ?? 0}% rain</Text></GlassCard>;
            })}</View>
          </>
        ) : null}
        <View style={styles.footer}><Text style={styles.footerBubble}>◦</Text><Text style={styles.footerText}>A brighter forecast, powered by Open-Meteo</Text></View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#9ae5eb' },
  sky: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: 'transparent' },
  orbOne: { position: 'absolute', width: 400, height: 400, borderRadius: 200, top: -210, right: -175, opacity: 0.85 },
  orbTwo: { position: 'absolute', width: 310, height: 310, borderRadius: 155, top: 190, left: -215, opacity: 0.75 },
  horizon: { position: 'absolute', width: 700, height: 260, borderRadius: 350, backgroundColor: 'rgba(78, 207, 158, .23)', bottom: -210, left: -95, transform: [{ rotate: '-8deg' }] },
  bubbleOne: { position: 'absolute', top: 210, right: 28, width: 19, height: 19, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.48)', borderWidth: 1, borderColor: 'rgba(255,255,255,.8)' },
  bubbleTwo: { position: 'absolute', top: 248, right: 62, width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,.64)' },
  bubbleThree: { position: 'absolute', top: 375, left: 17, width: 13, height: 13, borderRadius: 7, backgroundColor: 'rgba(255,255,255,.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,.8)' },
  bubbleFour: { position: 'absolute', top: 405, left: 42, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.65)' },
  bubbleFive: { position: 'absolute', top: 500, right: 21, width: 11, height: 11, borderRadius: 6, backgroundColor: 'rgba(255,255,255,.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,.75)' },
  cloudOne: { position: 'absolute', top: 112, right: -28, width: 130, height: 37, borderRadius: 30, backgroundColor: 'rgba(255,255,255,.42)' },
  cloudTwo: { position: 'absolute', top: 143, right: 15, width: 65, height: 29, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.50)' },
  cloudPuffA: { position: 'absolute', width: 50, height: 50, borderRadius: 28, backgroundColor: 'rgba(255,255,255,.42)', left: 20, bottom: 4 }, cloudPuffB: { position: 'absolute', width: 38, height: 38, borderRadius: 20, backgroundColor: 'rgba(255,255,255,.42)', left: 57, bottom: 3 },
  cloudPuffC: { position: 'absolute', width: 33, height: 33, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.50)', left: 9, bottom: 0 }, cloudPuffD: { position: 'absolute', width: 31, height: 31, borderRadius: 17, backgroundColor: 'rgba(255,255,255,.50)', left: 32, bottom: 2 },
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 24, paddingTop: Platform.OS === 'web' ? 30 : 58, paddingBottom: 30 },
  topBar: { flexDirection: 'row', alignItems: 'center' }, brandMark: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#ffffffaa', borderWidth: 1, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginRight: 11 }, brandSun: { fontSize: 29, lineHeight: 34, color: '#0a9694' }, brand: { color: '#17696b', fontSize: 13, fontWeight: '900', letterSpacing: 2.5 }, brandSub: { color: '#659a99', fontSize: 10, marginTop: 2 }, livePill: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', backgroundColor: '#eafff4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15, borderWidth: 1, borderColor: '#fff' }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#39bd88', marginRight: 6 }, liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: '#398a72' },
  intro: { marginTop: 34, marginBottom: 19 }, eyebrow: { fontSize: 9, color: '#4f9b99', letterSpacing: 2.4, fontWeight: '800' }, headline: { fontSize: 34, lineHeight: 40, color: '#155f66', fontWeight: '800', letterSpacing: -.8, marginTop: 5 }, date: { color: '#6b9d9c', fontSize: 13, marginTop: 4 },
  searchRow: { flexDirection: 'row', gap: 9, marginBottom: 9 }, searchBox: { flex: 1, minHeight: 50, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: '#ffffff', borderRadius: 17, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, shadowColor: '#378e87', shadowOpacity: .06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, searchIcon: { fontSize: 26, color: '#68a8a5', transform: [{ rotate: '-20deg' }], marginRight: 9 }, searchInput: { flex: 1, fontSize: 14, color: '#225e63', paddingVertical: 12, outlineStyle: 'none' }, clearText: { fontSize: 24, lineHeight: 27, color: '#7bb2ad', paddingHorizontal: 3 }, searchButtonWrap: { minWidth: 100, borderRadius: 17, shadowColor: '#3bb889', shadowOpacity: .4, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 6 }, searchButton: { flex: 1, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, overflow: 'hidden' }, buttonGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', backgroundColor: 'rgba(255,255,255,0.25)', borderTopLeftRadius: 17, borderTopRightRadius: 17 }, pressed: { opacity: .8, transform: [{ scale: .96 }] }, searchButtonText: { color: 'white', fontWeight: '800', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.1)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 2 }, arrow: { color: 'white', fontSize: 17, marginLeft: 7 }, suggestions: { marginTop: -2, marginBottom: 11, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,.98)', overflow: 'hidden', shadowColor: '#408f89', shadowOpacity: .12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 5 }, suggestion: { minHeight: 57, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(87,157,151,.18)' }, suggestionLast: { borderBottomWidth: 0 }, suggestionPressed: { backgroundColor: '#e7f8f2' }, suggestionPin: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center', marginRight: 10 }, suggestionPinText: { color: '#188f8b', fontSize: 18 }, suggestionCopy: { flex: 1 }, suggestionName: { color: '#28696d', fontSize: 14, fontWeight: '800' }, suggestionRegion: { color: '#78a09d', fontSize: 11, marginTop: 2 }, suggestionChevron: { color: '#69a8a1', fontSize: 23, marginLeft: 8 }, suggestionStatus: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14 }, suggestionStatusText: { color: '#679593', fontSize: 12 }, locateButtonWrap: { alignSelf: 'flex-start', marginBottom: 15, borderRadius: 14, shadowColor: '#287570', shadowOpacity: .1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }, locateButton: { minHeight: 39, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.9)', backgroundColor: 'rgba(255,255,255,.45)', flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' }, locateBusy: { opacity: .7 }, locateIcon: { fontSize: 18, lineHeight: 20, color: '#178f8d' }, locateText: { color: '#296b6b', fontSize: 13, fontWeight: '800' }, locateArrow: { color: '#69a8a1', fontSize: 14, marginLeft: 2 },
  glass: { backgroundColor: 'rgba(226,255,250,.28)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,.82)', borderRadius: 29, shadowColor: '#167f92', shadowOpacity: .20, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8, overflow: 'hidden' }, heroCard: { paddingHorizontal: 21, paddingTop: 20, paddingBottom: 17, overflow: 'hidden' }, cardShine: { position: 'absolute', height: 1, top: 0, left: 28, right: 28, backgroundColor: 'rgba(255,255,255,0.98)' }, heroHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, locationLabel: { color: '#398b8d', fontWeight: '900', fontSize: 9, letterSpacing: 2.1 }, city: { marginTop: 5, fontSize: 27, color: '#105a6c', fontWeight: '900', letterSpacing: -.5 }, pin: { fontSize: 17, color: '#36a79d' }, region: { color: '#568c92', fontSize: 12, marginTop: 1, fontWeight: '700' }, sunBadge: { width: 46, height: 46, borderRadius: 17, backgroundColor: 'rgba(255,244,214,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.96)', shadowColor: '#efbd54', shadowOpacity: 0.35, shadowRadius: 9, shadowOffset: { width:0, height:3 }, elevation: 3 }, sunGlyph: { fontSize: 24, color: '#e5ab37' },
  weatherMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }, temperature: { fontSize: 90, lineHeight: 100, fontWeight: '200', color: '#13676b', letterSpacing: -5, textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 4 }, feels: { color: '#5e9494', fontSize: 12, marginTop: -4, fontWeight: '700' }, weatherIconWrap: { width: 112, height: 102, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.6)', marginRight: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' }, weatherIcon: { fontSize: 68, textShadowColor: 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 5 }, textShadowRadius: 10 }, conditionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 17 }, conditionDot: { height: 7, width: 7, borderRadius: 4, backgroundColor: '#45db9c', marginRight: 8, shadowColor: '#45db9c', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width:0, height:0 } }, condition: { fontSize: 16, color: '#2d7a79', fontWeight: '800' }, highLow: { marginLeft: 'auto', fontSize: 12, fontWeight: '800', color: '#60918e' }, divider: { height: 1, backgroundColor: 'rgba(57,153,148,.2)', marginTop: 17, marginBottom: 14 }, detailsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, detail: { flexDirection: 'row', alignItems: 'center', gap: 8 }, detailIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: 'rgba(233,248,242,0.8)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }, detailLabel: { fontSize: 8, letterSpacing: 1, color: '#639995', fontWeight: '900' }, detailValue: { color: '#277073', fontSize: 16, fontWeight: '900', marginTop: 2 }, detailUnit: { fontSize: 10, fontWeight: '700', color: '#5f918e' }, detailDivider: { width: 1, height: 27, backgroundColor: 'rgba(186,227,219,0.7)' },
  forecastHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 12, paddingHorizontal: 2 }, forecastTitle: { color: '#1c6669', fontWeight: '900', fontSize: 17 }, forecastCaption: { color: '#5e9492', fontSize: 11, marginTop: 2, fontWeight: '600' }, forecastSun: { fontSize: 26, color: '#56ad95' }, forecastRow: { flexDirection: 'row', gap: 9 }, forecastCard: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 3, borderRadius: 19, backgroundColor: 'rgba(255,255,255,.4)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }, forecastDay: { color: '#508a88', fontSize: 11, fontWeight: '800' }, forecastIcon: { fontSize: 24, marginTop: 9, marginBottom: 8, textShadowColor: 'rgba(255,255,255,0.5)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 6 }, forecastHigh: { color: '#276b6b', fontWeight: '900', fontSize: 14 }, forecastLow: { color: '#7aaba6', fontSize: 12, marginTop: 2, fontWeight: '700' }, rainChance: { color: '#449e9b', fontSize: 9, fontWeight: '800', marginTop: 7 },
  notice: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(255,244,223,0.8)', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }, noticeIcon: { color: '#bd8841', fontSize: 15, marginRight: 8 }, noticeText: { color: '#926d3b', fontSize: 11, flex: 1, fontWeight: '600' }, retry: { color: '#7b653b', fontWeight: '900', fontSize: 11, paddingLeft: 8 }, refreshing: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 5 }, refreshingText: { color: '#488c8a', fontSize: 12, fontWeight: '700' }, loadingCard: { alignItems: 'center', padding: 40 }, loadingText: { marginTop: 15, color: '#488c8a', fontSize: 13, fontWeight: '700' }, emptyCard: { alignItems: 'center', padding: 25 }, emptyEmoji: { fontSize: 42, textShadowColor: 'rgba(255,255,255,0.6)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 8 }, emptyTitle: { fontSize: 19, fontWeight: '900', color: '#1e666a', marginTop: 12 }, emptyCopy: { color: '#5b918f', textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: 7, fontWeight: '600' }, tryButtonWrap: { marginTop: 17, borderRadius: 14, shadowColor: '#3bb889', shadowOpacity: .3, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 5 }, tryButton: { minWidth: 120, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, overflow: 'hidden', alignItems: 'center' }, tryText: { color: '#fff', fontWeight: '900', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.1)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 23, gap: 7 }, footerBubble: { fontSize: 17, color: '#4da699' }, footerText: { color: '#629690', fontSize: 10, letterSpacing: .2, fontWeight: '600' },
});
