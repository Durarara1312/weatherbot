const path = require('path');
const fs = require('fs');

// Автоматическая загрузка всех файлов локализации
const localesPath = path.join(__dirname, '../locales');
const locales = {};

// Читаем все JSON-файлы из папки locales
fs.readdirSync(localesPath).forEach((file) => {
    const langCode = file.split('.')[0]; // Извлекаем код языка (например, 'en' из 'en.json')
    locales[langCode] = require(path.join(localesPath, file));
});

module.exports = {
    /**
     * Получить локализованный текст по ключу
     * @param {number} chatId - ID пользователя Telegram
     * @param {string} key - Ключ для поиска текста
     * @param {Object} params - Параметры для замены плейсхолдеров
     * @returns {Promise<string>} - Локализованный текст
     */
    getLocaleText(chatId, key, params = {}) {
        return new Promise((resolve, reject) => {
            // Получаем язык пользователя из базы данных
            require('../database').getUserLanguage(chatId, async (err, row) => {
                if (err) {
                    console.error(`Ошибка при получении языка для chatId ${chatId}:`, err.message);
                    return resolve(this.getDefaultText(key)); // Возвращаем текст по умолчанию
                }

                const userLanguage = row?.language || 'en'; // Язык по умолчанию — английский
                const localizedText = locales[userLanguage]?.[key];

                if (!localizedText) {
                    console.warn(`Ключ "${key}" не найден для языка "${userLanguage}". Используется текст по умолчанию.`);
                    return resolve(this.getDefaultText(key)); // Возвращаем текст по умолчанию
                }

                // Замена плейсхолдеров
                let text = localizedText;
                for (const [placeholder, value] of Object.entries(params)) {
                    text = text.replace(new RegExp(`{${placeholder}}`, 'g'), value);
                }
                resolve(text);
            });
        });
    },

    /**
     * Получить язык пользователя
     * @param {number} chatId - ID пользователя Telegram
     * @returns {Promise<string>} - Код языка ('en', 'ru', 'es', 'fr', 'de' и т.д.)
     */
    getUserLanguage(chatId) {
        return new Promise((resolve, reject) => {
            require('../database').getUserLanguage(chatId, (err, row) => {
                if (err) {
                    console.error(`Ошибка при получении языка для chatId ${chatId}:`, err.message);
                    return resolve('en'); // Возвращаем язык по умолчанию — английский
                }
                const userLanguage = row?.language || 'en'; // Язык по умолчанию — английский
                resolve(userLanguage);
            });
        });
    },

    /**
     * Получить текст по умолчанию (английский)
     * @param {string} key - Ключ для поиска текста
     * @returns {string} - Текст на английском языке
     */
    getDefaultText(key) {
        return locales['en'][key] || `⚠️ Текст для ключа "${key}" не найден`;
    }
};