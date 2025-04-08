const { 
    getTemperatureUnitLabel, 
    getPressureUnitLabel, 
    getWindSpeedUnitLabel 
} = require('./formatting');

/**
 * Преобразует единицы измерения температуры, давления и скорости ветра
 * @param {Object} weatherData - Данные о погоде
 * @param {string} temperatureUnit - Единица измерения температуры
 * @param {string} pressureUnit - Единица измерения давления
 * @param {string} windSpeedUnit - Единица измерения скорости ветра
 * @param {string} languageCode - Код языка пользователя (например, "en", "ru")
 * @returns {Object} - Преобразованные данные о погоде
 */
function convertWeatherUnits(weatherData, temperatureUnit, pressureUnit, windSpeedUnit, languageCode) {
    let temperature = weatherData.temperature; // Температура в °C
    let feelsLike = weatherData.feels_like;   // "Ощущается как" в °C
    let pressure = weatherData.pressureHpa;   // Давление в гПа
    let windSpeed = weatherData.wind_speed;   // Скорость ветра в м/с
    // Конвертация температуры
    if (temperatureUnit === 'fahrenheit') {
        temperature = (temperature * 9 / 5) + 32; // Конвертация в °F
        feelsLike = (feelsLike * 9 / 5) + 32;     // Конвертация "ощущается как"
    } else if (temperatureUnit === 'kelvin') {
        temperature += 273.15; // Конвертация в K
        feelsLike += 273.15;   // Конвертация "ощущается как"
    }

    // Конвертация давления
    if (pressureUnit === 'mmhg') {
        pressure *= 0.750062; // Конвертация в мм рт. ст.
    } else if (pressureUnit === 'psi') {
        pressure *= 0.0145038; // Конвертация в psi
    }

    // Конвертация скорости ветра
    if (windSpeedUnit === 'kmh') {
        windSpeed *= 3.6; // Конвертация в км/ч
    }

    return {
        ...weatherData,
        temperature: parseFloat(temperature.toFixed(1)), // Округляем до 1 знака после запятой
        feels_like: parseFloat(feelsLike.toFixed(1)),    // Округляем до 1 знака после запятой
        pressureHpa: parseFloat(pressure.toFixed(1)),    // Округляем до 1 знака после запятой
        wind_speed: parseFloat(windSpeed.toFixed(1)),    // Округляем до 1 знака после запятой
       // formattedtemperatureunit: getTemperatureUnitLabel(temperatureUnit), // Читаемый формат температуры
       // formattedpressureunit: getPressureUnitLabel(pressureUnit),          // Читаемый формат давления
        formattedtemperatureunit: getTemperatureUnitLabel(temperatureUnit), // Читаемый формат температуры
        formattedpressureunit: getPressureUnitLabel(pressureUnit, languageCode), // Локализованный формат давления
        formattedwindspeedunit: getWindSpeedUnitLabel(windSpeedUnit, languageCode), // Локализованный формат скорости ветра
        temperature_unit: temperatureUnit, // Сохраняем единицу измерения температуры
        pressure_unit: pressureUnit,       // Сохраняем единицу измерения давления
        wind_speed_unit: windSpeedUnit     // Сохраняем единицу измерения скорости ветра
    };
}



module.exports = { convertWeatherUnits };