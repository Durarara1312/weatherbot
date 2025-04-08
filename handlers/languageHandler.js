const database = require('../database');
const localization = require('../utils/localization');
const menuHandler = require('./menuHandler');

module.exports = {
    /**
     * Отправляет меню выбора языка
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async sendLanguageMenu(bot, chatId) {
        const selectLanguagePrompt = await localization.getLocaleText(chatId, 'select_language_prompt');
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Русский 🇷🇺', callback_data: 'set_language_ru' }],
                    [{ text: 'English 🇬🇧', callback_data: 'set_language_en' }],
                    [{ text: 'Español 🇪🇸', callback_data: 'set_language_es' }],
                    [{ text: 'Français 🇫🇷', callback_data: 'set_language_fr' }],
                    [{ text: 'Deutsch 🇩🇪', callback_data: 'set_language_de' }]
                ]
            }
        };
        bot.sendMessage(chatId, selectLanguagePrompt, keyboard);
    },

    /**
     * Обрабатывает установку языка
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} query - CallbackQuery от Telegram
     * @param {string} language - Код языка ('ru', 'en', 'es', 'fr', 'de')
     */
    handleSetLanguage(bot, query, language) {
        const chatId = query.message.chat.id;

        // Определяем ключи для успешного сообщения и ошибки
        const successMessageKey = `language_changed_${language}`;
        const errorMessageKey = `language_change_error_${language}`;

        database.setUserLanguage(chatId, language, async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, errorMessageKey);
                bot.sendMessage(chatId, errorMessage);
                return;
            }

            const successMessage = await localization.getLocaleText(chatId, successMessageKey);
            bot.sendMessage(chatId, successMessage);

            // Отправляем главное меню после изменения языка
            const keyboard = await menuHandler.getMainMenuKeyboard(chatId);
            const mainMenuMessage = await localization.getLocaleText(chatId, 'main_menu_message');
            bot.sendMessage(chatId, mainMenuMessage, keyboard);
        });
    }
};