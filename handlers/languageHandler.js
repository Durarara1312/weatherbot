const database = require('../database');
const localization = require('../utils/localization');

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
                    [{ text: 'Русский', callback_data: 'set_language_ru' }],
                    [{ text: 'English', callback_data: 'set_language_en' }]
                ]
            }
        };
        bot.sendMessage(chatId, selectLanguagePrompt, keyboard);
    },

    /**
     * Обрабатывает установку языка
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} query - CallbackQuery от Telegram
     * @param {string} language - Код языка ('ru' или 'en')
     */
    handleSetLanguage(bot, query, language) {
        const chatId = query.message.chat.id;
        const successMessageKey = language === 'ru' ? 'language_changed_ru' : 'language_changed_en';
        const errorMessageKey = language === 'ru' ? 'language_change_error_ru' : 'language_change_error_en';

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
            const menuHandler = require('./menuHandler');
            const keyboard = await menuHandler.getMainMenuKeyboard(chatId);
            bot.sendMessage(chatId, await localization.getLocaleText(chatId, 'main_menu_message'), keyboard);
        });
    }
};