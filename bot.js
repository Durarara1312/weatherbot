const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const weatherHandler = require('./handlers/weatherHandler');
const menuHandler = require('./handlers/menuHandler');
const adminHandler = require('./handlers/adminHandler');
const languageHandler = require('./handlers/languageHandler');
const timeHandler = require('./handlers/timeHandler');
const localization = require('./utils/localization');
const cityHandler = require('./handlers/cityHandler');
const subscriptionHandler = require('./handlers/subscriptionHandler');
const logger = require('./utils/logger');
const feedbackHandler = require('./handlers/feedbackHandler');
const statsHandler = require('./handlers/statsHandler');

// Состояния пользователей
const userStates = {};

// Инициализация бота
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
console.log("Бот запущен!");

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    menuHandler.sendMainMenu(bot, chatId);
});

// Обработка команды /userstats (только для администратора)
bot.onText(/\/userstats/, (msg) => {
    adminHandler.handleStatsCommand(bot, msg);
});

// Обработка команды /broadcast (только для администратора)
bot.onText(/\/broadcast/, (msg) => {
    adminHandler.handleBroadcastCommand(bot, msg);
});

// Обработка callback-запросов
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    switch (data) {
        case 'subscription_menu':
            menuHandler.sendSubscriptionMenu(bot, chatId);
            break;
        case 'actions_menu':
            menuHandler.sendActionsMenu(bot, chatId);
            break;
        case 'change_language':
            languageHandler.sendLanguageMenu(bot, chatId);
            break;
        case 'set_language_ru':
            languageHandler.handleSetLanguage(bot, query, 'ru');
            break;
        case 'set_language_en':
            languageHandler.handleSetLanguage(bot, query, 'en');
            break;
        case 'back_to_main_menu':
            menuHandler.sendMainMenu(bot, chatId);
            break;
        case 'current_weather':
            weatherHandler.handleCurrentWeather(bot, query);
            break;
        case 'change_city':
            menuHandler.handleCitySelection(bot, chatId);
            break;
        case 'change_time':
            timeHandler.requestNewTime(bot, chatId);
            break;
        case 'subscribe':
            subscriptionHandler.handleSubscribe(bot, chatId);
            break;
        case 'unsubscribe':
            subscriptionHandler.handleUnsubscribe(bot, chatId);
            break;
        case 'feedback':
            await feedbackHandler.handleFeedbackAction(bot, chatId);
            break;
        case 'stats':
            await statsHandler.handleStatsRequest(bot, chatId);
            break;
        default:
            console.log("Неизвестный callback:", data);
    }

    // Подтверждаем получение callback-запроса
    bot.answerCallbackQuery(query.id);
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Если это ответ на запрос времени
    if (msg.reply_to_message) {
        const replyText = msg.reply_to_message.text;
        const enterNewTimePrompt = await localization.getLocaleText(chatId, 'enter_time_prompt');
        
        if (replyText === enterNewTimePrompt) {
            timeHandler.handleNewTime(bot, msg);
        }
    }
    if (msg.reply_to_message) {
        const replyText = msg.reply_to_message.text;
        const enterCityPrompt = await localization.getLocaleText(chatId, 'enter_city_prompt');

        if (replyText === enterCityPrompt) {
            cityHandler.handleNewCity(bot, msg);
        }
    }
    // Если пользователь находится в состоянии ожидания отзыва
    if (userStates[chatId] === 'waiting_for_feedback') {
        await feedbackHandler.handleFeedbackMessage(bot, msg);
    }

}),

// Рассылка погоды по подписке
setInterval(() => {
    weatherHandler.sendScheduledWeather(bot);
}, 60000); // Проверяем каждую минуту


// Обработка необработанных исключений
process.on('uncaughtException', async (error) => {
    console.error("Необработанное исключение:", error.message);
    try {
        await logger.error("Необработанное исключение", error); // Отправляем ошибку на логгер-бот
    } catch (loggingError) {
        console.error("Ошибка при отправке лога:", loggingError.message);
    }
    setTimeout(() => process.exit(1), 1000); // Даем время на отправку сообщения
});
// Обработка необработанных ошибок Promise
process.on('unhandledRejection', async (reason, promise) => {
    console.error("Необработанная ошибка Promise:", reason);
    console.error("Promise details:", promise);
    try {
        await logger.error(`Необработанная ошибка Promise: ${reason}`, promise);
    } catch (loggingError) {
        console.error("Ошибка при отправке лога:", loggingError.message);
    }
    setTimeout(() => process.exit(1), 1000); // Даем время на отправку сообщения
});