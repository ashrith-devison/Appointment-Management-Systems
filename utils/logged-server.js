import express from 'express';
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createLogger = (logFileName) => {
    const date = new Date().toISOString().split('T')[0];
    const logPath = path.join(__dirname, '..', 'logs', `${logFileName}-${date}.log`);

    const transports = [];

    if (process.env.LOGS_IN_WINSTON === 'true') {
        transports.push(new winston.transports.File({ filename: logPath }));
    }

    if (process.env.LOGS_IN_CONSOLE === 'true') {
        transports.push(new winston.transports.Console());
    }

    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message }) => {
                return `${timestamp} [${level.toUpperCase()}]: ${message}`;
            })
        ),
        transports: transports
    });
};

const loggedServer = (port, callback, logFileName = 'app') => {
    const logger = createLogger(logFileName);
    const app = express();

    app.use(express.json());

    app.use((req, res, next) => {
        const logData = {
            time: new Date().toISOString(),
            ip: req.headers["x-forwarded-for"] || req.ip,
            method: req.method,
            url: req.originalUrl,
            userAgent: req.headers["user-agent"],
            body: req.body,
        };

        logger.info(`Incoming Request: ${JSON.stringify(logData)}`);
        next();
    });

    return {
        app,
        start: () => {
            app.listen(port, () => {
                console.log(`Server is running on port ${port}`);
                if (callback) callback();
            });
        },
    };
}

export default loggedServer;