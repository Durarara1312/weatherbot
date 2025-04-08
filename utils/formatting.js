const localization = require('./localization');
const database = require('../database');

/**
 * Экранирует специальные символы для Markdown
 * @param {string} text - Текст для экранирования
 * @returns {string} - Экранированный текст
 */
const escapeMarkdown = (text) => {
    return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
};

/**
 * Возвращает читаемый формат для единицы измерения температуры
 * @param {string} unit - Единица измерения температуры
 * @returns {string} - Читаемый формат
 */
function getTemperatureUnitLabel(unit) {
    const labels = {
        celsius: '°C',
        fahrenheit: '°F',
        kelvin: 'K'
    };
    return labels[unit] || '°C'; // По умолчанию °C
}

/**
 * Возвращает локализованный формат для единицы измерения давления
 * @param {string} unit - Единица измерения давления
 * @param {string} languageCode - Код языка пользователя (например, "en", "ru")
 * @returns {string} - Локализованная метка
 */
function getPressureUnitLabel(unit, languageCode) {
    const labels = {
        mmhg: {
            ru: 'мм рт. ст.',
            en: 'mmHg'
        },
        hpa: {
            ru: 'гПа',
            en: 'hPa'
        },
        psi: {
            ru: 'psi',
            en: 'psi'
        }
    };
    // Убедимся, что languageCode — это строка
    const lang = typeof languageCode === 'string' ? languageCode : 'ru';
    // Возвращаем метку для выбранного языка или по умолчанию для русского
    return labels[unit]?.[lang] || labels[unit]?.['ru'] || 'гПа';
}

/**
 * Возвращает локализованный формат для единицы измерения скорости ветра
 * @param {string} unit - Единица измерения скорости ветра
 * @param {string} languageCode - Код языка пользователя (например, "en", "ru")
 * @returns {string} - Локализованная метка
 */
function getWindSpeedUnitLabel(unit, languageCode) {

    const labels = {
        ms: {
            ru: 'м/с',
            en: 'm/s'
        },
        kmh: {
            ru: 'км/ч',
            en: 'km/h'
        }
    };

    // Убедимся, что languageCode — это строка
    const lang = typeof languageCode === 'string' ? languageCode : 'ru';

    // Возвращаем метку для выбранного языка или по умолчанию для русского
    const result = labels[unit]?.[lang] || labels[unit]?.['ru'] || 'м/с';
    return result;
};

/**
 * Форматирует сообщение с данными о погоде
 * @param {Object} weatherData - Данные о погоде
 * @param {string} city - Город
 * @returns {Promise<string>} - Отформатированное сообщение
 */
async function formatWeatherMessage(weatherData, city) {
    const chatId = weatherData.chatId;

    // Получаем шаблон сообщения из локализации
    const template = await localization.getLocaleText(chatId, 'weather_template');
    if (!template) {
        return "⚠️ Произошла ошибка при формировании сообщения.";
    }

    // Получаем язык пользователя
    const userLanguageCode = await new Promise((resolve, reject) => {
        database.getUserLanguage(chatId, (err, result) => {
            if (err) {
                reject(err);
            } else {
                const lang = typeof result === 'object' ? result?.language : result;
                resolve(lang || 'en'); // Преобразуем объект в строку
            }
        });
    }).catch((err) => {
        console.error(`Ошибка при получении языка пользователя для chatId ${chatId}:`, err.message);
        return 'en'; // По умолчанию английский
    });

    // Получаем локализованные описания погоды
    const localizedDescriptions = await localization.getLocaleText(chatId, 'weather_descriptions');
    const localizedDescription = localizedDescriptions[weatherData.descriptionKey] || weatherData.description;

    // Экранируем все поля
    const escapedCity = escapeMarkdown(city);
    const escapedDescription = escapeMarkdown(localizedDescription);

    // Определяем единицы измерения
    const temperatureUnit = getTemperatureUnitLabel(weatherData.temperature_unit);
    const pressureUnit = getPressureUnitLabel(weatherData.pressure_unit, userLanguageCode);
    const windSpeedUnit = getWindSpeedUnitLabel(weatherData.wind_speed_unit || 'ms', userLanguageCode);

    // Форматируем сообщение
    return template
        .replace("{city}", escapedCity)
        .replace("{temperature}", `${weatherData.temperature} ${temperatureUnit}`)
        .replace("{formattedfeelslike}", `${weatherData.feels_like} ${temperatureUnit}`)
        .replace("{formattedtemperature}", temperatureUnit)
        .replace("{humidity}", weatherData.humidity)
        .replace("{pressure}", `${weatherData.pressureHpa} ${pressureUnit}`)
        .replace("{formattedpressure}", pressureUnit)
        .replace("{windspeed}", `${weatherData.wind_speed.toFixed(1)} ${windSpeedUnit}`)
        .replace("{formattedwindspeed}", windSpeedUnit)
        .replace("{cloudiness}", weatherData.cloudiness)
        .replace("{visibility}", weatherData.visibility.toFixed(1))
        .replace("{sunrise}", weatherData.sunrise)
        .replace("{sunset}", weatherData.sunset)
        .replace("{rain}", weatherData.rain || 0)
        .replace("{snow}", weatherData.snow || 0)
        .replace("{description}", escapedDescription);
}

/**
 * Форматирует сообщение с прогнозом погоды через определённое количество часов
 * @param {Object} weatherData - Данные о погоде
 * @param {string} city - Город
 * @param {number} hours - Количество часов (3, 6 или 12)
 * @returns {Promise<string>} - Отформатированное сообщение
 */
async function formatFutureWeatherMessage(weatherData, city, hours) {
    const chatId = weatherData.chatId;

    // Получаем шаблон сообщения из локализации
    const template = await localization.getLocaleText(chatId, 'future_weather_template');
    if (!template) {
        return "⚠️ Произошла ошибка при формировании сообщения.";
    }

    // Получаем язык пользователя
    const userLanguageCode = await new Promise((resolve, reject) => {
        database.getUserLanguage(chatId, (err, result) => {
            if (err) {
                reject(err);
            } else {
                const lang = typeof result === 'object' ? result?.language : result;
                resolve(lang || 'en'); // Преобразуем объект в строку
            }
        });
    }).catch((err) => {
        console.error(`Ошибка при получении языка пользователя для chatId ${chatId}:`, err.message);
        return 'en'; // По умолчанию английский
    });

    // Получаем локализованные описания погоды
    const localizedDescriptions = await localization.getLocaleText(chatId, 'weather_descriptions');
    const localizedDescription = localizedDescriptions[weatherData.description] || weatherData.description;

    // Экранируем все поля
    const escapedCity = escapeMarkdown(city);
    const escapedDescription = escapeMarkdown(localizedDescription);

    // Определяем единицы измерения
    const temperatureUnit = getTemperatureUnitLabel(weatherData.temperature_unit);
    const pressureUnit = getPressureUnitLabel(weatherData.pressure_unit, userLanguageCode);
    const windSpeedUnit = getWindSpeedUnitLabel(weatherData.wind_speed_unit || 'ms', userLanguageCode);


    const now = new Date();
    const approximateTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const formattedApproximateTime = approximateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Форматируем сообщение
    return template
        .replace("{city}", escapedCity)
        .replace("{hours}", hours)
        .replace("{temperature}", `${weatherData.temperature} ${temperatureUnit}`)
        .replace("{formattedfeelslike}", `${weatherData.feels_like} ${temperatureUnit}`)
        .replace("{formattedtemperature}", temperatureUnit)
        .replace("{pressure}", `${weatherData.pressureHpa} ${pressureUnit}`)
        .replace("{formattedpressure}", pressureUnit)
        .replace("{windspeed}", `${weatherData.wind_speed.toFixed(1)} ${windSpeedUnit}`)
        .replace("{formattedwindspeed}", windSpeedUnit)
        .replace("{pop}", `${(weatherData.pop * 100).toFixed(0)}%`)
        .replace("{description}", escapedDescription)
        .replace("{approximate_time}", formattedApproximateTime)
}

// Экспортируем функции
module.exports = {
    formatWeatherMessage,
    getTemperatureUnitLabel,
    getPressureUnitLabel,
    getWindSpeedUnitLabel,
    formatFutureWeatherMessage
};