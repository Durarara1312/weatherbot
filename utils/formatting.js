const localization = require('./localization');

module.exports = {
    /**
     * Форматирует сообщение с данными о погоде
     * @param {Object} weatherData - Данные о погоде
     * @param {string} city - Город
     * @returns {Promise<string>} - Отформатированное сообщение
     */
    async formatWeatherMessage(weatherData, city) {
        const chatId = weatherData.chatId;

        // Получаем шаблон сообщения из локализации
        const template = await localization.getLocaleText(chatId, 'weather_template');
        if (!template) {
            return "⚠️ Произошла ошибка при формировании сообщения.";
        }

        // Получаем локализованные описания погоды
        const localizedDescriptions = await localization.getLocaleText(chatId, 'weather_descriptions');
        const localizedDescription = localizedDescriptions[weatherData.descriptionKey] || originalDescription;

        // Форматируем сообщение
        return template
            .replace("{city}", city)
            .replace("{temperature}", weatherData.temperature.toFixed(1))
            .replace("{feels_like}", weatherData.feels_like.toFixed(1))
            .replace("{humidity}", weatherData.humidity)
            .replace("{pressure}", `${weatherData.pressureHpa}`) // Единица измерения добавляется только здесь
            .replace("{wind_speed}", `${weatherData.wind_speed.toFixed(1)}`)
            .replace("{cloudiness}", weatherData.cloudiness)
            .replace("{visibility}", weatherData.visibility.toFixed(1))
            .replace("{sunrise}", weatherData.sunrise)
            .replace("{sunset}", weatherData.sunset)
            .replace("{rain}", weatherData.rain || 0)
            .replace("{snow}", weatherData.snow || 0)
            .replace("{description}", localizedDescription);
    }
};