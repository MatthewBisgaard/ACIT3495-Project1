import mysql from 'mysql'
import { error } from 'node:console';

const dbcon = mysql.createConnection({
    host: process.env.DATABASE_URL ?? 'db',
    user: process.env.MYSQL_USER ?? 'app',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.DATABSE_URL
});

const queryDatabase = (sql: string, parameters: any[]): => {
    return new Promise((resolve, reject) => {
        dbcon.connect( (err) => {
            if (err) return reject(err);
            dbcon.query(sql, parameters, (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    });
};

export {
    dbcon,
    queryDatabase
}