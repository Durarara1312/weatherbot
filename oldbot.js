const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const fs = require('fs');
// Замените YOUR_TELEGRAM_BOT_TOKEN на ваш токен от @BotFather
const token = '1808958052:AAHAwyrqb7y5_sM2jvQP1ypJ-t3r6qWNAm4';

// ID администратора (замените на ваш chat_id)
const ADMIN_CHAT_ID = 653104212; // Укажите ваш chat_id здесь

// Создаем бота
const bot = new TelegramBot(token, { polling: true });

// Подключаемся к базе данных SQLite
const db = new sqlite3.Database('./weather_bot.db');

// Объект для отслеживания состояния ожидания ответа от пользователей
const userStates = {};

// Создаем таблицы для хранения подписок и статистики
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        chat_id INTEGER PRIMARY KEY,
        city TEXT,
        time TEXT,
        timezone TEXT,
        subscription_start DATE DEFAULT (date('now')),
        language TEXT DEFAULT (text('en'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
        chat_id INTEGER PRIMARY KEY,
        total_requests INTEGER DEFAULT 0,
        weather_requests INTEGER DEFAULT 0,
        city_changes INTEGER DEFAULT 0,
        time_changes INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS weather_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        city TEXT,
        temperature REAL,
        humidity INTEGER,
        description TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Загружаем языковые файлы
const languages = {
    en: JSON.parse(fs.readFileSync('./locales/en.json', 'utf8')),
    ru: JSON.parse(fs.readFileSync('./locales/ru.json', 'utf8'))
};

// Функция для получения текста на нужном языке
function getLocaleText(chatId, key) {
    return new Promise((resolve, reject) => {
        db.get("SELECT language FROM subscriptions WHERE chat_id = ?", [chatId], (err, row) => {
            if (err) {
                return reject(err);
            }
            const language = row?.language || 'en'; // По умолчанию английский
            resolve(languages[language][key]);
        });
    });
}

// Объект для хранения message_id последнего меню
const lastMenuMessageId = {};

// Inline keyboard markup для меню
const mainMenuKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '📌 Подписка', callback_data: 'subscription_menu' }],
            [{ text: '🌤️ Действия', callback_data: 'actions_menu' }]
        ]
    }
};

const subscriptionMenuKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '📌 Подписаться', callback_data: 'subscribe' }],
            [{ text: '⚙️ Изменить город', callback_data: 'change_city' }],
            [{ text: '⏰ Изменить время', callback_data: 'change_time' }],
            [{ text: '❌ Отменить подписку', callback_data: 'unsubscribe' }],
            [{ text: '⬅️ Назад', callback_data: 'back_to_main_menu' }]
        ]
    }
};

const actionsMenuKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🌤️ Текущая погода', callback_data: 'current_weather' }],
            [{ text: '📊 Статистика', callback_data: 'stats' }],
            [{ text: '💬 Обратная связь', callback_data: 'feedback' }],
            [{ text: '⬅️ Назад', callback_data: 'back_to_main_menu' }]
        ]
    }
};

// Отправляем сообщение с меню
async function sendMenu(chatId, keyboard = mainMenuKeyboard) {
    // Проверяем, есть ли сохраненный message_id для этого пользователя
    if (lastMenuMessageId[chatId]) {
        try {
            // Удаляем старое сообщение
            await bot.deleteMessage(chatId, lastMenuMessageId[chatId]);
        } catch (error) {
            console.error(`Ошибка при удалении сообщения ${lastMenuMessageId[chatId]}:`, error.message);
        }
    }

    // Отправляем новое сообщение с меню
    const sentMessage = await bot.sendMessage(chatId, "Выберите действие:", keyboard);

    // Сохраняем message_id нового сообщения
    lastMenuMessageId[chatId] = sentMessage.message_id;
}

// Функция для получения данных о погоде через API OpenWeatherMap
async function getWeatherByCity(city) {
    const apiKey = "3cea34b26dd41310d93283c98b8d2903"; // Ваш API-ключ для OpenWeatherMap
    try {
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=ru&appid=${apiKey}`
        );
        return response.data;
    } catch (error) {
        console.error(`Ошибка при получении данных о погоде для города ${city}:`, error.message);
        return null;
    }
}

// Функция для отправки погоды пользователям в заданное время
function sendWeatherAtScheduledTimes() {
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;
    db.each("SELECT * FROM subscriptions", async (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.time === currentTime) {
            const weatherData = await getWeatherByCity(row.city);
            if (weatherData) {
                const message = formatWeatherMessage(weatherData, row.city);
                bot.sendMessage(row.chat_id, message);

                // Логируем погодные данные
                db.run(
                    "INSERT INTO weather_history (chat_id, city, temperature, humidity, description) VALUES (?, ?, ?, ?, ?)",
                    [row.chat_id, row.city, weatherData.main.temp, weatherData.main.humidity, weatherData.weather[0].description]
                );
            } else {
                bot.sendMessage(row.chat_id, `Не удалось получить данные о погоде для города ${row.city}.`);
            }
        }
    });
}

// Функция для форматирования сообщения о погоде
function formatWeatherMessage(weatherData, city) {
    const temperature = weatherData.main.temp; // Температура
    const feelsLike = weatherData.main.feels_like; // Ощущаемая температура
    const humidity = weatherData.main.humidity; // Влажность
    const pressure = weatherData.main.pressure; // Давление
    const windSpeed = weatherData.wind.speed; // Скорость ветра
    const clouds = weatherData.clouds.all; // Облачность
    const visibility = weatherData.visibility / 1000; // Видимость (в км)
    const sunrise = new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString(); // Восход солнца
    const sunset = new Date(weatherData.sys.sunset * 1000).toLocaleTimeString(); // Закат солнца
    const rain = weatherData.rain ? weatherData.rain['1h'] : 0; // Осадки за последний час (дождь)
    const snow = weatherData.snow ? weatherData.snow['1h'] : 0; // Осадки за последний час (снег)
    const description = weatherData.weather[0].description; // Описание погоды
    return `☁️ **Погода в ${city}:**\n` +
        `🌡️ Температура: ${temperature.toFixed(1)}°C (ощущается как ${feelsLike.toFixed(1)}°C)\n` +
        `💧 Влажность: ${humidity}%\n` +
        `📊 Давление: ${pressure} гПа\n` +
        `💨 Ветер: ${windSpeed} м/с\n` +
        `☁️ Облачность: ${clouds}%\n` +
        `👀 Видимость: ${visibility.toFixed(1)} км\n` +
        `🌅 Восход солнца: ${sunrise}\n` +
        `🌇 Закат солнца: ${sunset}\n` +
        `🌧️ Осадки (дождь): ${rain.toFixed(1)} мм\n` +
        `❄️ Осадки (снег): ${snow.toFixed(1)} мм\n` +
        `🌤️ Описание: ${description}`;
}

// Планировщик задач для проверки времени каждую минуту
cron.schedule('* * * * *', () => {
    console.log('Проверка времени для отправки погоды...');
    sendWeatherAtScheduledTimes();
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name || "Пользователь";

    // Проверяем, является ли пользователь новым
    db.get("SELECT * FROM subscriptions WHERE chat_id = ?", [chatId], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (!row) {
            // Если пользователь новый, отправляем уведомление администратору
            bot.sendMessage(ADMIN_CHAT_ID, `🔔 Новый пользователь запустил бота:\nID: ${chatId}\nИмя: ${firstName}`);
        }
    });

    // Инициализируем статистику пользователя
    db.run("INSERT OR IGNORE INTO user_stats (chat_id) VALUES (?)", [chatId]);

    sendMenu(chatId);
});

// Обработчик команды /users (только для администратора)
bot.onText(/\/users/, (msg) => {
    const chatId = msg.chat.id;

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
        return;
    }

    // Получаем список всех пользователей
    db.all("SELECT * FROM subscriptions", async (err, rows) => {
        if (err) {
            return console.error(err.message);
        }
        if (rows.length === 0) {
            bot.sendMessage(chatId, "Нет активных пользователей.");
            return;
        }

        let message = "📊 Список пользователей:\n";
        for (const row of rows) {
            try {
                const user = await bot.getChat(row.chat_id);
                const username = user.username ? `@${user.username}` : user.first_name || "Неизвестный";
                const city = row.city || "не установлен";
                const time = row.time || "не установлено";
                message += `\n• ${username} / ${user.id}\nГород: ${city}\nВремя: ${time}\n`;
            } catch (error) {
                console.error(`Ошибка при получении данных пользователя с ID ${row.chat_id}:`, error.message);
                message += `\n• Пользователь с ID ${row.chat_id} (данные недоступны)\n`;
            }
        }
        bot.sendMessage(chatId, message);
    });
});

// Обработчик команды /broadcast (только для администратора)
bot.onText(/\/broadcast/, (msg) => {
    const chatId = msg.chat.id;

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
        return;
    }

    // Запрашиваем текст для рассылки
    bot.sendMessage(chatId, "Введите текст для рассылки:");
    bot.once('message', (msgText) => {
        const broadcastMessage = msgText.text;

        // Получаем список всех подписанных пользователей
        db.all("SELECT chat_id FROM subscriptions", (err, rows) => {
            if (err) {
                console.error(err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при получении списка пользователей.");
                return;
            }
            if (rows.length === 0) {
                bot.sendMessage(chatId, "❌ Нет подписанных пользователей.");
                return;
            }

            let successCount = 0;
            let errorCount = 0;

            // Отправляем сообщение каждому пользователю
            rows.forEach((row) => {
                const userChatId = row.chat_id;
                bot.sendMessage(userChatId, broadcastMessage)
                    .then(() => {
                        successCount++;
                    })
                    .catch((error) => {
                        console.error(`Ошибка при отправке сообщения пользователю ${userChatId}:`, error.message);
                        errorCount++;
                    })
                    .finally(() => {
                        // Если все сообщения отправлены, отправляем отчет администратору
                        if (successCount + errorCount === rows.length) {
                            bot.sendMessage(
                                chatId,
                                `✅ Рассылка завершена.\nУспешно отправлено: ${successCount}\nОшибок: ${errorCount}`
                            );
                        }
                    });
            });
        });
    });
});

// Обработчик команды /sendmessage (только для администратора)
bot.onText(/\/sendmessage/, (msg) => {
    const chatId = msg.chat.id;

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
        return;
    }

    // Получаем список всех пользователей
    db.all("SELECT chat_id FROM subscriptions", async (err, rows) => {
        if (err) {
            return console.error(err.message);
        }
        if (rows.length === 0) {
            bot.sendMessage(chatId, "❌ Нет активных пользователей.");
            return;
        }

        let message = "👥 Список активных пользователей:\n";
        for (const row of rows) {
            try {
                const user = await bot.getChat(row.chat_id);
                const username = user.username ? `@${user.username}` : "Нет никнейма";
                message += `• chat_id: ${row.chat_id}, Никнейм: ${username}\n`;
            } catch (error) {
                console.error(`Ошибка при получении данных пользователя с chat_id ${row.chat_id}:`, error.message);
                message += `• chat_id: ${row.chat_id}, Данные недоступны\n`;
            }
        }

        bot.sendMessage(chatId, message);

        // Запрашиваем chat_id пользователя
        bot.sendMessage(chatId, "Введите chat_id пользователя:");
        bot.once('message', (msgChatId) => {
            const targetChatId = msgChatId.text;

            // Проверяем, является ли chat_id числом
            if (!/^\d+$/.test(targetChatId)) {
                bot.sendMessage(chatId, "❌ Некорректный chat_id. Введите число.");
                return;
            }

            // Запрашиваем текст сообщения
            bot.sendMessage(chatId, "Введите текст сообщения:");
            bot.once('message', (msgText) => {
                const messageText = msgText.text;

                // Отправляем сообщение пользователю
                bot.sendMessage(targetChatId, messageText)
                    .then(() => {
                        bot.sendMessage(chatId, `✅ Сообщение успешно отправлено пользователю с chat_id ${targetChatId}.`);
                    })
                    .catch((error) => {
                        console.error(`Ошибка при отправке сообщения пользователю с chat_id ${targetChatId}:`, error.message);
                        bot.sendMessage(chatId, `❌ Не удалось отправить сообщение пользователю с chat_id ${targetChatId}.`);
                    });
            });
        });
    });
});

// Обработчик inline-кнопок
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === 'subscription_menu') {
        // Переход в подменю "Подписка"
        await sendMenu(chatId, subscriptionMenuKeyboard);
    } else if (action === 'actions_menu') {
        // Переход в подменю "Действия"
        await sendMenu(chatId, actionsMenuKeyboard);
    } else if (action === 'back_to_main_menu') {
        // Возврат в главное меню
        await sendMenu(chatId, mainMenuKeyboard);
    } else if (action === 'subscribe') {
        bot.sendMessage(chatId, "Введите название города:");
        userStates[chatId] = 'waiting_for_city_subscribe';
    } else if (action === 'change_city') {
        bot.sendMessage(chatId, "Введите новый город:");
        userStates[chatId] = 'waiting_for_city';
    } else if (action === 'change_time') {
        bot.sendMessage(chatId, "Введите новое время для рассылки (в формате HH:MM):\nВАЖНО: Бот работает в таймзоне UTC+3");
        userStates[chatId] = 'waiting_for_time';
    } else if (action === 'unsubscribe') {
        // Удаление подписки пользователя
        db.run("DELETE FROM subscriptions WHERE chat_id = ?", [chatId], function (err) {
            if (err) {
                return console.error(err.message);
            }
            if (this.changes > 0) {
                bot.sendMessage(chatId, "✅ Вы успешно отменили подписку на рассылку погоды.");
            } else {
                bot.sendMessage(chatId, "❌ У вас нет активной подписки.");
            }
            sendMenu(chatId, mainMenuKeyboard);
        });
    } else if (action === 'current_weather') {
        // Получаем город пользователя из базы данных
        db.get("SELECT city FROM subscriptions WHERE chat_id = ?", [chatId], async (err, row) => {
            if (err) {
                return console.error(err.message);
            }
            if (!row || !row.city) {
                bot.sendMessage(chatId, "❌ Вы не указали город. Подпишитесь на рассылку или измените город.");
                sendMenu(chatId, mainMenuKeyboard);
                return;
            }
            const city = row.city;
            const weatherData = await getWeatherByCity(city);
            if (weatherData) {
                const message = formatWeatherMessage(weatherData, city);
                bot.sendMessage(chatId, message);
            } else {
                bot.sendMessage(chatId, `❌ Не удалось получить данные о погоде для города ${city}.`);
            }
            sendMenu(chatId, mainMenuKeyboard);
        });
    } else if (action === 'stats') {
        // Логика для статистики
        db.get("SELECT * FROM subscriptions WHERE chat_id = ?", [chatId], (err, subscriptionRow) => {
            if (err) {
                return console.error(err.message);
            }

            db.get("SELECT * FROM user_stats WHERE chat_id = ?", [chatId], (err, statsRow) => {
                if (err) {
                    return console.error(err.message);
                }

                db.all("SELECT * FROM weather_history WHERE chat_id = ? AND date >= date('now', '-30 days')", [chatId], (err, weatherRows) => {
                    if (err) {
                        return console.error(err.message);
                    }

                    // Подсчитываем статистику по погоде
                    const temperatures = weatherRows.map(row => row.temperature);
                    const avgTemperature = temperatures.reduce((sum, temp) => sum + temp, 0) / temperatures.length || 0;
                    const maxTemperature = Math.max(...temperatures) || 0;
                    const minTemperature = Math.min(...temperatures) || 0;
                    const rainyDays = weatherRows.filter(row => row.description.toLowerCase().includes('rain')).length;
                    const sunnyDays = weatherRows.filter(row => row.description.toLowerCase().includes('clear')).length;

                    // Формируем сообщение со статистикой
                    let message = "";

                    if (subscriptionRow) {
                        const subscriptionStartDate = new Date(subscriptionRow.subscription_start); // Преобразуем строку в объект Date
                        const now = new Date();
                        const weeksActive = Math.floor((now - subscriptionStartDate) / (1000 * 60 * 60 * 24 * 7));
                    
                        message += `📊 Подписка активна с: ${subscriptionStartDate.toLocaleDateString()} (${weeksActive} недели)\n`;
                    }

                    if (statsRow) {
                        message += `\n📊 Статистика использования бота:\n` +
                            `Общее количество запросов: ${statsRow.total_requests}\n` +
                            `Запросов текущей погоды: ${statsRow.weather_requests}\n` +
                            `Изменений города: ${statsRow.city_changes}\n` +
                            `Изменений времени: ${statsRow.time_changes}\n`;
                    }

                    if (weatherRows.length > 0) {
                        message += `\n📊 Статистика погоды в вашем городе:\n` +
                            `Средняя температура за месяц: ${avgTemperature.toFixed(1)}°C\n` +
                            `Самая высокая температура: ${maxTemperature.toFixed(1)}°C\n` +
                            `Самая низкая температура: ${minTemperature.toFixed(1)}°C\n` +
                            `Дождливых дней: ${rainyDays}\n` +
                            `Солнечных дней: ${sunnyDays}\n`;
                    } else {
                        message += `\n📊 Статистика погоды пока недоступна. Запросите текущую погоду, чтобы начать сбор данных.`;
                    }

                    bot.sendMessage(chatId, message);
                });
            });
        });
    } else if (action === 'feedback') {
        bot.sendMessage(chatId, "Введите ваш отзыв:");
        userStates[chatId] = 'waiting_for_feedback';
    }
});

// Обработчик текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Увеличиваем общий счетчик запросов
    db.run("INSERT OR IGNORE INTO user_stats (chat_id) VALUES (?)", [chatId]);
    db.run("UPDATE user_stats SET total_requests = total_requests + 1 WHERE chat_id = ?", [chatId]);

    // Игнорируем команды (начинаются с "/")
    if (text.startsWith('/')) {
        return;
    }

    // Проверяем состояние пользователя
    if (userStates[chatId] === 'waiting_for_city_subscribe') {
        // Пользователь вводит город
        const city = text;
        const weatherData = await getWeatherByCity(city);
        if (!weatherData) {
            bot.sendMessage(chatId, `Город "${city}" не найден. Попробуйте снова.`);
            delete userStates[chatId]; // Сбрасываем состояние
            return;
        }
        // Сохраняем город во временное состояние
        userStates[chatId] = { step: 'waiting_for_time_subscribe', city };
        // Запрашиваем время
        bot.sendMessage(chatId, "Введите время для рассылки (в формате HH:MM):\nВАЖНО: Бот работает в таймзоне UTC+3");
    } else if (userStates[chatId]?.step === 'waiting_for_time_subscribe') {
        // Пользователь вводит время
        const time = text;
        // Проверяем формат времени (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(time)) {
            bot.sendMessage(chatId, "❌ Неверный формат времени. Введите время в формате HH:MM.");
            return;
        }
        // Получаем сохраненный город из состояния
        const city = userStates[chatId].city;
        // Сохраняем данные в базу
        db.run(
            "INSERT INTO subscriptions (chat_id, city, time) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET city = excluded.city, time = excluded.time",
            [chatId, city, time],
            function (err) {
                if (err) {
                    return console.error(err.message);
                }
                bot.sendMessage(chatId, `Вы успешно подписались на рассылку погоды для ${city} в ${time}.`);
                delete userStates[chatId]; // Сбрасываем состояние
                sendMenu(chatId, mainMenuKeyboard);
            }
        );
    } else if (userStates[chatId] === 'waiting_for_city') {
        // Обработка изменения города
        const city = text;
        const weatherData = await getWeatherByCity(city);
        if (!weatherData) {
            bot.sendMessage(chatId, `Город "${city}" не найден. Попробуйте снова.`);
            delete userStates[chatId]; // Сбрасываем состояние
            return;
        }
        db.run("UPDATE subscriptions SET city = ? WHERE chat_id = ?", [city, chatId], function (err) {
            if (err) {
                return console.error(err.message);
            }
            bot.sendMessage(chatId, `Город успешно изменен на ${city}.`);
            db.run("UPDATE user_stats SET city_changes = city_changes + 1 WHERE chat_id = ?", [chatId]);
            delete userStates[chatId]; // Сбрасываем состояние
            sendMenu(chatId, mainMenuKeyboard);
        });
    } else if (userStates[chatId] === 'waiting_for_time') {
        // Пользователь вводит время
        const time = text;
        // Проверяем формат времени (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(time)) {
            bot.sendMessage(chatId, "❌ Неверный формат времени. Введите время в формате HH:MM.");
            return;
        }
        // Обновляем время в базе данных
        db.run("UPDATE subscriptions SET time = ? WHERE chat_id = ?", [time, chatId], function (err) {
            if (err) {
                return console.error(err.message);
            }
            bot.sendMessage(chatId, `Время успешно изменено на ${time}.`);
            db.run("UPDATE user_stats SET time_changes = time_changes + 1 WHERE chat_id = ?", [chatId]);
            delete userStates[chatId]; // Сбрасываем состояние
            sendMenu(chatId, mainMenuKeyboard);
        });
    } else if (userStates[chatId] === 'waiting_for_feedback') {
        // Обработка отзыва
        const feedback = text;
        bot.sendMessage(ADMIN_CHAT_ID, `🔔 Новый отзыв от пользователя ${chatId}:\n${feedback}`);
        bot.sendMessage(chatId, "✅ Ваш отзыв отправлен. Спасибо!");
        delete userStates[chatId]; // Сбрасываем состояние
        sendMenu(chatId, mainMenuKeyboard);
    } else {
        // Если пользователь отправил сообщение вне контекста, предлагаем команду /start
        bot.sendMessage(chatId, "Используйте команду /start для начала работы.");
    }
});

// Обработчик команды /adminstats (только для администратора)
bot.onText(/\/adminstats/, (msg) => {
    const chatId = msg.chat.id;

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
        return;
    }

    // Получаем общую статистику
    db.all("SELECT city, COUNT(*) AS count FROM subscriptions GROUP BY city ORDER BY count DESC", (err, rows) => {
        if (err) {
            return console.error(err.message);
        }

        let message = "📊 Статистика использования бота:\n";
        db.get("SELECT COUNT(*) AS active_users FROM subscriptions", (err, activeUsersRow) => {
            if (err) {
                return console.error(err.message);
            }
            message += `Активных подписчиков: ${activeUsersRow.active_users}\n`;

            db.get("SELECT COUNT(*) AS new_users FROM subscriptions WHERE subscription_start >= date('now', '-7 days')", (err, newUsersRow) => {
                if (err) {
                    return console.error(err.message);
                }
                message += `Новых пользователей за неделю: ${newUsersRow.new_users}\n`;

                message += "\nПопулярные города:\n";
                if (rows.length > 0) {
                    rows.forEach(row => {
                        message += `• ${row.city}: ${row.count} пользователей\n`;
                    });
                } else {
                    message += "Нет данных о популярных городах.\n";
                }

                db.get("SELECT SUM(total_requests) AS total_requests FROM user_stats", (err, requestsRow) => {
                    if (err) {
                        return console.error(err.message);
                    }
                    message += `\nОбщее количество запросов за все время: ${requestsRow.total_requests}`;

                    bot.sendMessage(chatId, message);
                });
            });
        });
    });
});

console.log("Бот запущен!");