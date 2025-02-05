const locales = {
    en: require('../locales/en.json'),
    ru: require('../locales/ru.json')
};

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
     * Получить текст по умолчанию (английский)
     * @param {string} key - Ключ для поиска текста
     * @returns {string} - Текст на английском языке
     */
    getDefaultText(key) {
        return locales['en'][key] || `⚠️ Текст для ключа "${key}" не найден`;
    }
};