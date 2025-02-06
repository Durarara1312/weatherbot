const userStates = {}; // Состояния пользователей (можно заменить на базу данных, если нужно)
const localization = require('../utils/localization');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = {
    /**
     * Обработка кнопки "Обратная связь"
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID пользователя Telegram
     */
    async handleFeedbackAction(bot, chatId) {
        // Устанавливаем состояние ожидания отзыва
        userStates[chatId] = 'waiting_for_feedback';

        try {
            const feedbackPrompt = await localization.getLocaleText(chatId, 'feedback_prompt');
            bot.sendMessage(chatId, feedbackPrompt);
        } catch (error) {
            logger.error("Ошибка при отправке запроса на отзыв", error);
            bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
        }
    },

    /**
     * Обработка текстового сообщения как отзыва
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} msg - Сообщение от пользователя
     */
    async handleFeedbackMessage(bot, msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const username = msg.from.username || 'Не указан';
        const feedbackText = msg.text;

        if (userStates[chatId] === 'waiting_for_feedback') {
            // Проверяем, что отзыв не пустой
            if (!feedbackText.trim()) {
                const invalidFeedbackError = await localization.getLocaleText(chatId, 'invalid_feedback_error');
                bot.sendMessage(chatId, invalidFeedbackError);
                return;
            }

            // Логируем отзыв
            logger.info(`Получен отзыв от пользователя ${username} (ID: ${userId}): ${feedbackText}`);

            // Отправляем подтверждение пользователю
            try {
                const feedbackConfirmation = await localization.getLocaleText(chatId, 'feedback_success');
                bot.sendMessage(chatId, feedbackConfirmation);

                // Отправляем отзыв администратору
                const adminMessage = `
                    📝 Новый отзыв от пользователя:
                    👤 Username: ${username}
                    🔢 User ID: ${userId}
                    💬 Отзыв: ${feedbackText}
                `;
                bot.sendMessage(config.ADMIN_CHAT_ID, adminMessage);

                // Очищаем состояние
                delete userStates[chatId];
            } catch (error) {
                logger.error("Ошибка при отправке подтверждения отзыва", error);
                bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
            }
        }
    }
};