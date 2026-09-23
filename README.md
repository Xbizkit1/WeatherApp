# AeroCast weather app

A mobile-first Expo Router weather app with a Frutiger Aero inspired glass interface.

## Assessment features

- **Data connection:** Uses `fetch` and `async`/`await` to look up a city with the Open-Meteo geocoding API, then requests current weather, UV index, and a five-day forecast.
- **State handling:** React state represents loading, success, empty input, and error states. Loading and error feedback stays visible during a refresh while previously loaded weather remains on screen.
- **User interaction:** Search by typing a city and pressing Search or submitting the keyboard. Clear the search field, retry an unsuccessful request, and see a useful message for an unknown city.
- **Worldwide places:** City and municipality searches include location suggestions worldwide, with country and region labels. The location button asks for foreground permission and loads weather for the device's coordinates.
- **Request ordering:** If users start multiple searches, only the latest response updates the screen.
- **Weather details:** Current temperature, feels-like temperature, condition, high/low, humidity, wind, UV index, and four upcoming forecast days.

## Run and demonstrate

Install dependencies with `npm install`, then start Expo with `npx expo start`.

- Press `w` in the Expo terminal to open the web version in a browser.
- Scan the QR code with Expo Go to demonstrate on a phone.
- To use an Android emulator, start it first, then press `a` in the Expo terminal.

For a source-code submission, include this project folder with `src/app/`, `package.json`, `package-lock.json`, and `app.json`. A device or emulator demonstration still needs to be recorded or shown during submission; the project guide cannot provide that recording itself.

Weather data is provided by [Open-Meteo](https://open-meteo.com/). An internet connection is required for city search and forecasts.
