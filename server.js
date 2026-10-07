require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo').MongoStore;
const { engine } = require('express-handlebars');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Cấu hình Handlebars view engine
app.engine('hbs', engine({ extname: '.hbs', defaultLayout: 'main' }));
app.set('view engine', 'hbs');
app.set('views', './views');

// --- 1. ĐA LUỒNG KẾT NỐI MONGODB (Đọc và Ghi độc lập) ---
const connRead = mongoose.createConnection(process.env.MONGO_URI_READ);
const connWrite = mongoose.createConnection(process.env.MONGO_URI_WRITE);

connRead.on('connected', () => console.log('Đã kết nối tài khoản ĐỌC (Reader) thành công!'));
connWrite.on('connected', () => console.log('Đã kết nối tài khoản GHI (Writer) thành công!'));

// Định nghĩa Schema Sách
const bookSchema = new mongoose.Schema({
    productCode: { type: String, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true },
    finalPrice: { type: Number, required: true }
});

const BookRead = connRead.model('Book', bookSchema, 'books');
const BookWrite = connWrite.model('Book', bookSchema, 'books');

// --- 2. STATELESS SESSION LƯU TRỰC TIẾP XUỐNG MONGODB ATLAS ---
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI_SESSION || process.env.MONGO_URI_WRITE,
        collectionName: 'sessions',
        autoRemove: 'disabled'
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Middleware truyền thông tin sinh viên & VAT xuống Footer
app.use((req, res, next) => {
    res.locals.studentName = "Dương Khánh"; 
    res.locals.studentId = "23IT081";     
    res.locals.vatRate = 7;               
    next();
});

// --- 3. CÁC ROUTE XỬ LÝ (READ / WRITE) ---

// Trang chủ redirect về /books
app.get('/', (req, res) => {
    res.redirect('/books');
});

// Xem danh sách sách (Dùng kết nối ĐỌC)
app.get('/books', async (req, res) => {
    try {
        const books = await BookRead.find({}).lean();
        res.render('books', { books });
    } catch (err) {
        res.status(500).send("Lỗi đọc dữ liệu: " + err.message);
    }
});

// Thêm mới sách (Dùng kết nối GHI và Thuật toán cá nhân hóa)
app.post('/books/add', async (req, res) => {
    try {
        const { productCode, title, price } = req.body;
        
        // Kiểm tra tiền tố 3 số cuối MSSV (081)
        const mssvSuffix = "081"; 
        if (!productCode || !productCode.startsWith(mssvSuffix)) {
            return res.status(400).send(`Mã sản phẩm bắt buộc phải có tiền tố là 3 số cuối MSSV (${mssvSuffix})!`);
        }

        const vatPercentage = 7; 
        const numericPrice = parseFloat(price);
        const finalPrice = numericPrice * (1 + vatPercentage / 100);

        const newBook = new BookWrite({
            productCode,
            title,
            price: numericPrice,
            finalPrice
        });

        await newBook.save();
        res.redirect('/books');
    } catch (err) {
        res.status(500).send("Lỗi ghi dữ liệu: " + err.message);
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server đang chạy trên cổng ${process.env.PORT || 3000}`);
});