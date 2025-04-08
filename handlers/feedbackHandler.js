const database = require('../database');
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
        try {
            // Устанавливаем состояние ожидания отзыва
            database.setState(chatId, 'waiting_for_feedback', (err) => {
                if (err) {
                    console.error(`Ошибка при установке состояния для chatId ${chatId}:`, err.message);
                } else {
                    console.log(`[DEBUG] Установлено состояние waiting_for_feedback для chatId ${chatId}`);
                }
            });

            // Отправляем запрос на отзыв
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

        // Получаем состояние пользователя
        database.getState(chatId, async (err, row) => {
            if (err) {
                console.error(`Ошибка при получении состояния для chatId ${chatId}:`, err.message);
                return;
            }

            const currentState = row?.state;

            console.log(`[DEBUG] Текущее состояние для chatId ${chatId}: ${currentState}`);

            // Проверяем состояние пользователя
            if (currentState === 'waiting_for_feedback') {
                // Проверяем, что отзыв не пустой
                if (!feedbackText.trim()) {
                    const invalidFeedbackError = await localization.getLocaleText(chatId, 'invalid_feedback_error');
                    bot.sendMessage(chatId, invalidFeedbackError);
                    return;
                }

                try {
                    // Логируем отзыв
                    logger.info(`Получен отзыв от пользователя ${username} (ID: ${userId}): ${feedbackText}`);

                    // Отправляем подтверждение пользователю
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
                    database.clearState(chatId, (err) => {
                        if (err) {
                            console.error(`Ошибка при очистке состояния для chatId ${chatId}:`, err.message);
                        } else {
                            console.log(`[DEBUG] Состояние очищено для chatId ${chatId}`);
                        }
                    });
                } catch (error) {
                    logger.error("Ошибка при отправке подтверждения отзыва", error);
                    bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
                }
            }
        });
    }
};