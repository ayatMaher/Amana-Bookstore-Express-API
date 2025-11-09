const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Simple logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Read JSON files
const readJSONFile = (filename) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'data', filename), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { books: [], reviews: [] };
    }
};

const booksData = readJSONFile('books.json');
const reviewsData = readJSONFile('reviews.json');

// ==================== ROUTES ====================

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to Amana Bookstore API',
        version: '1.0.0'
    });
});

// GET all books
app.get('/api/books', (req, res) => {
    res.json({
        success: true,
        count: booksData.books.length,
        data: booksData.books
    });
});

// GET featured books
app.get('/api/books/featured', (req, res) => {
    const featuredBooks = booksData.books.filter(book => book.featured === true);
    res.json({
        success: true,
        count: featuredBooks.length,
        data: featuredBooks
    });
});

// GET book by ID
app.get('/api/books/:id', (req, res) => {
    const book = booksData.books.find(b => b.id === req.params.id);
    if (!book) {
        return res.status(404).json({ success: false, message: 'Book not found' });
    }
    res.json({ success: true, data: book });
});

// GET reviews for book
app.get('/api/reviews/book/:bookId', (req, res) => {
    const bookReviews = reviewsData.reviews.filter(review => review.bookId === req.params.bookId);
    res.json({
        success: true,
        count: bookReviews.length,
        data: bookReviews
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;