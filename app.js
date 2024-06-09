const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const sqlite3 = require('sqlite3').verbose();

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('db/sqlite.db', (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

// 會員註冊
app.post('/member-register', async (req, res) => {
    const { tel, first_name, last_name, sex, birthday, password } = req.body;

    if (!tel || !first_name || !last_name || !password) {
        console.error('Missing required fields');
        return res.status(400).json({ error: '請填寫所有必填欄位' });
    }

    const sql = 'INSERT INTO customer (tel, first_name, last_name, sex, birthday, password) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sql, [tel, first_name, last_name, sex, birthday, password], function (err) {
        if (err) {
            console.error('Database insertion error:', err.message);
            return res.status(500).json({ error: '註冊失敗' });
        }
        console.log('Member registered successfully with ID:', this.lastID);
        res.status(201).json({ message: '註冊成功' });
    });
});

// 會員登入
app.post('/member-login', async (req, res) => {
    const { tel, password } = req.body;

    if (!tel || !password) {
        console.error('Missing required fields');
        return res.status(400).json({ error: '請填寫所有必填欄位' });
    }

    const sql = 'SELECT * FROM customer WHERE tel = ? AND password = ?';
    db.get(sql, [tel, password], (err, user) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ error: '登入失敗' });
        }

        if (!user) {
            console.error('User not found or incorrect password');
            return res.status(400).json({ error: '找不到用戶或密碼錯誤' });
        }

        console.log('Member logged in successfully');
        res.status(200).json({ message: '登入成功', redirectUrl: '/member-option.html' });
    });
});

// 員工登入
app.post('/employee-login', (req, res) => {
    const { id, e_password } = req.body;

    if (!id || !e_password) {
        console.error('Missing required fields');
        return res.status(400).json({ error: '請填寫所有必填欄位' });
    }

    const sql = 'SELECT * FROM employee WHERE ID = ?';
    db.get(sql, [id], (err, employee) => {
        if (err) {
            console.error('Database query error:', err.message);
            return res.status(500).json({ error: '登入失敗' });
        }

        if (!employee) {
            console.error('Employee not found');
            return res.status(400).json({ error: '找不到員工' });
        }

        if (employee.e_password !== e_password) {
            console.error('Incorrect password');
            return res.status(400).json({ error: '密碼錯誤' });
        }

        console.log('Employee logged in successfully');
        res.status(200).json({ message: '登入成功', redirectUrl: '/employee-option.html' });
    });
});

app.get('/search', (req, res) => {
    const { songNumber, songName, singer, type } = req.query;

    let query = `
        SELECT ml.song_number, mt.type, ms.song AS songName, mls.singer
        FROM music_library ml
        LEFT JOIN ml_type mt ON ml.song_number = mt.song_number
        LEFT JOIN ml_song ms ON ml.song_number = ms.song_number
        LEFT JOIN ml_singer mls ON ml.song_number = mls.song_number
        WHERE 1=1
    `;
    let params = [];

    if (songNumber) {
        query += ' AND ml.song_number = ?';
        params.push(songNumber);
    }
    if (songName) {
        query += ' AND ms.song = ?';
        params.push(songName);
    }
    if (singer) {
        query += ' AND mls.singer = ?';
        params.push(singer);
    }
    if (type) {
        query += ' AND mt.type = ?';
        params.push(type);
    }

    // 如果 songName 不为空，添加额外条件
    if (songName !== null) {
        query += ' AND ms.song IS NOT NULL';
    }

    // 添加日志查看SQL查询和参数
    console.log('Query:', query);
    console.log('Params:', params);

    db.all(query, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.json(rows);
    });
});



// 处理获取包厢状态的请求
app.get('/api/pNumberStatus', (req, res) => {
    const { start, end } = req.query; // 从查询参数中获取包厢编号范围

    // 构建查询条件，使用 BETWEEN 操作符查询范围内的包厢编号，并按编号升序排列
    const sql = 'SELECT * FROM box WHERE no BETWEEN ? AND ? ORDER BY no ASC';
    db.all(sql, [start, end], (err, rows) => {
        if (err) {
            console.error('Error querying database:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }

        if (rows.length === 0) {
            res.status(404).json({ error: 'No boxes found' });
            return;
        }
        // 返回包厢状态数组
        res.json(rows);
    });
});

// 处理更新包厢状态的请求
app.post('/api/updateBoxStatus', (req, res) => {
    const { no, state } = req.body;

    // 更新数据库中对应包厢的状态
    const sql = 'UPDATE box SET state = ? WHERE no = ?';
    db.run(sql, [state, no], function(err) {
        if (err) {
            console.error('Error updating database:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }

        if (this.changes === 0) {
            res.status(404).json({ error: 'Box not found' });
            return;
        }
        // 返回成功响应
        res.json({ success: true });
    });
});


// 创建一个路由来处理建议的提交
app.post('/submit-advice', (req, res) => {
    const { advice } = req.body;

    // 生成一个新的 song_number，从 90000000 开始，并递增
    db.get('SELECT MAX(song_number) AS max_song_number FROM music_library', (err, row) => {
        if (err) {
            console.error('数据库查询出错：', err.message);
            res.status(500).send('服务器出错');
            return;
        }

        let newSongNumber = 90000000;
        if (row.max_song_number) {
            newSongNumber = parseInt(row.max_song_number, 10) + 1;
        }

        // 将建议插入到数据库中
        db.run('INSERT INTO music_library (advice, song_number) VALUES (?, ?)', [advice, newSongNumber], (err) => {
            if (err) {
                console.error('插入数据到数据库出错：', err.message);
                res.status(500).send('服务器出错');
                return;
            }

            console.log('建议已成功插入到数据库中，song_number:', newSongNumber);
            res.status(200).send('建议已成功提交');
        });
    });
});

// 食物查询端点
app.get('/food', (req, res) => {
    const foodDate = req.query.date;
    if (!foodDate) {
        return res.status(400).send('Date is required');
    }

    const query = 'SELECT c_number, cuisine, food_time FROM food_bar WHERE food_date = ?';
    db.all(query, [foodDate], (err, results) => {
        if (err) {
            console.error('Error fetching food data:', err);
            return res.status(500).send('Server error');
        }
        res.json(results);
    });
});

// 处理获取评论的请求
app.get('/api/reviews', (req, res) => {
    const sql = 'SELECT * FROM music_library WHERE advice IS NOT NULL'; // 只获取 advice 不为空的评论
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// 启动服务器
const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
