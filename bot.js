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
const statsHandler = require('./handlers/statsHandler');
const feedbackHandler = require('./handlers/feedbackHandler');
const database = require('./database');
const unitsHandler = require('./handlers/unitsHandler.js');
const usersManager = require('./usersManager');

// Состояния пользователей
const userStates = {};

// Инициализация бота
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
    console.error("Ошибка при подключении к Telegram API:", error.message);
});

console.log("Бот запущен!");

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || null; // Username пользователя (если есть)
    const firstName = msg.from.first_name || 'Не указано';
    const lastName = msg.from.last_name || 'Не указано';

    console.log(`[DEBUG] Пользователь запустил бота: chatId ${chatId}, username ${username}`);
    try {
        // Проверяем, существует ли пользователь в базе данных
        const userExists = await new Promise((resolve, reject) => {
            database.getSubscription(chatId, (err, subscription) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!subscription); // true, если пользователь существует, иначе false
                }
            });
        });

        // Если пользователь новый, отправляем уведомление через логгер
        if (!userExists) {
            console.log(`[DEBUG] Новый пользователь: chatId ${chatId}, username ${username}`);
            logger.logNewUser({
                chatId,
                username,
                firstName,
                lastName
            });
        }

        // Добавляем или обновляем пользователя в таблице subscriptions
        database.upsertUser(chatId, username, (err) => {
            if (err) {
                console.error(`Ошибка при добавлении/обновлении пользователя chatId ${chatId}:`, err.message);
                bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
                return;
            }
            console.log(`[DEBUG] Пользователь успешно добавлен/обновлён в базе данных: chatId ${chatId}`);
        });

        // Отправляем приветственное сообщение
        const welcomeMessage = (await localization.getLocaleText(chatId, 'welcome_message')) || "Welcome!";
        const welcomeMessage2 = (await localization.getLocaleText(chatId, 'welcome_message2')) || "Use /start to begin.";
        bot.sendMessage(chatId, `${welcomeMessage}, ${firstName}!\n${welcomeMessage2}`);

        // Отправляем главное меню
        menuHandler.sendMainMenu(bot, chatId);
    } catch (error) {
        console.error("Ошибка при обработке команды /start:", error.message);
        bot.sendMessage(chatId, "Произошла ошибка. Попробуйте позже.");
    }
});

// Обработка команды /userstats (только для администратора)
bot.onText(/\/userstats/, (msg) => {
    adminHandler.handleStatsCommand(bot, msg);
});

// Обработка команды /settings для запуска мини-приложения
bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id;

    // Отправляем кнопку с мини-приложением
    bot.sendMessage(chatId, 'Откройте мини-приложение для настройки:', {
        reply_markup: {
            inline_keyboard: [
                [{
                    text: 'Открыть мини-приложение',
                    web_app: { url: 'https://durarara1312.github.io/weatherbot/' } // Замените на вашу ссылку
                }]
            ]
        }
    });
});

// Обработка callback-запросов
bot.on('callback_query', async (query) => {

    let chatId;
    if (query.message && query.message.chat && query.message.chat.id) {
        chatId = query.message.chat.id;
    } else if (query.from && query.from.id) {
        chatId = query.from.id;
    } else {
        console.error("[ERROR] Не удалось определить chatId из query:", JSON.stringify(query, null, 2));
        return; // Завершаем выполнение функции
    }

    // Проверяем, что query.data существует
    if (!query.data) {
        console.error("[ERROR] query.data не определён:", query);
        return;
    }

    const data = query.data;

    switch (data) {
        case 'manage_subscription':
            menuHandler.sendSubscriptionMenu(bot, chatId);
            break;
        case 'actions_menu':
            menuHandler.sendActionsMenu(bot, chatId);
            break;
        case 'profile_menu':
            menuHandler.sendProfileMenu(bot, chatId);
            break;
        case 'units_settings_menu':
            menuHandler.sendUnitsSettingsMenu(bot, chatId);
            break;
        case 'temperature_units_menu':
            menuHandler.sendTemperatureUnitsMenu(bot,chatId);
            break;
        case 'pressure_units_menu':
            menuHandler.sendPressureUnitsMenu(bot,chatId);
            break;
        case 'wind_speed_units_menu':
            menuHandler.sendWindSpeedUnitsMenu(bot, chatId);
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
        case 'set_language_es':
            languageHandler.handleSetLanguage(bot, query, 'es');
            break;
        case 'set_language_fr':
            languageHandler.handleSetLanguage(bot, query, 'fr');
            break;
        case 'set_language_de':
            languageHandler.handleSetLanguage(bot, query, 'de');
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
        case 'set_temperature_celsius':
            unitsHandler.handleSetTemperatureUnit(bot, chatId, 'celsius');
            break;
        case 'set_temperature_fahrenheit':
            unitsHandler.handleSetTemperatureUnit(bot, chatId, 'fahrenheit');
            break;
        case 'set_temperature_kelvin':
            unitsHandler.handleSetTemperatureUnit(bot, chatId, 'kelvin');
            break;
        case 'set_pressure_mmhg':
            unitsHandler.handleSetPressureUnit(bot, chatId, 'mmhg');
            break;
        case 'set_pressure_hpa':
            unitsHandler.handleSetPressureUnit(bot, chatId, 'hpa');
            break;
        case 'set_pressure_psi':
            unitsHandler.handleSetPressureUnit(bot, chatId, 'psi');
            break;
        case 'set_wind_speed_ms':
            unitsHandler.handleSetWindSpeedUnit(bot, chatId, 'ms');
            break;
        case 'set_wind_speed_kmh':
            unitsHandler.handleSetWindSpeedUnit(bot, chatId, 'kmh');
            break;
        case 'admin_panel':
            // Проверяем, что запрос отправлен администратором
            if (chatId !== config.ADMIN_CHAT_ID) {
                bot.sendMessage(chatId, "❌ Эта функция доступна только администратору.");
                return;
            }
            menuHandler.sendAdminPanel(bot, chatId);
            break;
        case 'admin_users_list':
            // Проверяем, что запрос отправлен администратором
            if (chatId !== config.ADMIN_CHAT_ID) {
                bot.sendMessage(chatId, "❌ Эта функция доступна только администратору.");
                return;
            }
            adminHandler.sendUsersList(bot, chatId);
            break;
        case 'admin_export_users':
            // Проверяем, что запрос отправлен администратором
            if (chatId !== config.ADMIN_CHAT_ID) {
                bot.sendMessage(chatId, "❌ Эта функция доступна только администратору.");
                return;
            }
            adminHandler.exportUsersToCSV(bot, chatId);
            break;
        case 'admin_filter_users':
            // Проверяем, что запрос отправлен администратором
            if (chatId !== config.ADMIN_CHAT_ID) {
            bot.sendMessage(chatId, "❌ Эта функция доступна только администратору.");
                return;
            }
            bot.sendMessage(chatId, "Введите параметры фильтрации в формате: city=Москва&status=active");
            break;
        case 'weather_3h':
        case 'weather_6h':
        case 'weather_12h':
            const hours = parseInt(data.split('_')[1]); // Извлекаем количество часов (3, 6 или 12)
            weatherHandler.handleFutureWeather(bot, query, hours);
            break;
        default:
            console.log("Неизвестный callback:", data);
    }

    // Подтверждаем получение callback-запроса
    bot.answerCallbackQuery(query.id);
});

// Обработка текстовых сообщений и данных из мини-приложения
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Проверяем, есть ли данные из мини-приложения
    if (msg.web_app_data) {
        const data = msg.web_app_data.data; // Получаем данные из мини-приложения
        console.log(`[DEBUG] Получены данные из мини-приложения: ${data}`);

        // Отправляем ответ пользователю
        bot.sendMessage(chatId, `Получены данные из мини-приложения: ${data}`);
        return; // Завершаем обработку, чтобы не выполнять остальной код
    }

    // Получаем состояние пользователя
    database.getState(chatId, async (err, row) => {
        if (err) {
            console.error(`Ошибка при получении состояния для chatId ${chatId}:`, err.message);
            return;
        }

        const currentState = row?.state;

        // Если пользователь находится в состоянии ожидания отзыва
        if (currentState === 'waiting_for_feedback') {
            await feedbackHandler.handleFeedbackMessage(bot, msg);
            return; // Завершаем обработку
        }

        // Если это ответ на запрос времени
        if (msg.reply_to_message) {
            const replyText = msg.reply_to_message.text;

            const enterNewTimePrompt = await localization.getLocaleText(chatId, 'enter_time_prompt');
            if (replyText === enterNewTimePrompt) {
                timeHandler.handleNewTime(bot, msg);
                return; // Завершаем обработку
            }

            const enterCityPrompt = await localization.getLocaleText(chatId, 'enter_city_prompt');
            if (replyText === enterCityPrompt) {
                cityHandler.handleNewCity(bot, msg);
                return; // Завершаем обработку
            }
        }
    });
});

// Рассылка погоды по подписке
setInterval(() => {
   // console.log('[NEW BOT] Проверка времени для отправки погоды...');
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