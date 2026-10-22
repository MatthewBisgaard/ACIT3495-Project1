import mysql from 'mysql2/promise'
import { QueryResult } from 'mysql2';
import { error } from 'node:console';

const queryDatabase = async (sql: string, parameters: any[]): Promise<any> => {
    const dbcon = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.DATABASE_SCHEMA,
        ssl: {
            rejectUnauthorized: false
        }
        });
        const results = await dbcon.query(sql, parameters);
        dbcon.end()
        return results[0]
};

export {
    queryDatabase
}