const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Custom logging middleware (without morgan)
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${req.method} ${req.url} - IP: ${req.ip}\n`;
    
    console.log(logEntry.trim()); // Log to console
    
    // Ensure logging directory exists
    const logDir = path.join(__dirname, 'logging');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Append to log file (async to not block requests)
    fs.appendFile(path.join(logDir, 'log.txt'), logEntry, (err) => {
        if (err) {
            console.error('Failed to write to log file:', err);
        }
    });
    
    next();
});

// Helper function to read JSON files
const readJSONFile = (filename) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'data', filename), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filename}:`, error);
        return { books: [], reviews: [] };
    }
};

// Helper function to write JSON files
const writeJSONFile = (filename, data) => {
    try {
        fs.writeFileSync(path.join(__dirname, 'data', filename), JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error(`Error writing ${filename}:`, error);
        return false;
    }
};

// Load initial data
let booksData = readJSONFile('books.json');
let reviewsData = readJSONFile('reviews.json');

// ==================== GET ROUTES ====================

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

// GET top 10 rated books
app.get('/api/books/top-rated', (req, res) => {
    const topBooks = booksData.books
        .map(book => ({
            ...book,
            weightedScore: (book.rating * book.reviewCount).toFixed(2)
        }))
        .sort((a, b) => b.weightedScore - a.weightedScore)
        .slice(0, 10);
    
    res.json({
        success: true,
        count: topBooks.length,
        data: topBooks
    });
});

// GET books by date range
app.get('/api/books/dates/:start/:end', (req, res) => {
    const startDate = req.params.start;
    const endDate = req.params.end;
    
    const filteredBooks = booksData.books.filter(book => {
        const bookDate = book.datePublished;
        return bookDate >= startDate && bookDate <= endDate;
    });
    
    res.json({
        success: true,
        count: filteredBooks.length,
        dateRange: { start: startDate, end: endDate },
        data: filteredBooks
    });
});

// GET single book by ID
app.get('/api/books/:id', (req, res) => {
    const bookId = req.params.id;
    const book = booksData.books.find(b => b.id === bookId);
    
    if (!book) {
        return res.status(404).json({
            success: false,
            message: `Book with ID ${bookId} not found`
        });
    }
    
    res.json({
        success: true,
        data: book
    });
});

// GET reviews for a specific book
app.get('/api/reviews/book/:bookId', (req, res) => {
    const bookId = req.params.bookId;
    
    // Check if book exists
    const book = booksData.books.find(b => b.id === bookId);
    if (!book) {
        return res.status(404).json({
            success: false,
            message: `Book with ID ${bookId} not found`
        });
    }
    
    const bookReviews = reviewsData.reviews.filter(review => review.bookId === bookId);
    
    res.json({
        success: true,
        book: {
            id: book.id,
            title: book.title,
            author: book.author
        },
        count: bookReviews.length,
        data: bookReviews
    });
});

// ==================== POST ROUTES ====================

// Simple authentication middleware
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    // Simple token-based authentication
    if (!authHeader || authHeader !== 'Bearer amana-secret-token-2024') {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please provide valid authorization token.'
        });
    }
    
    next();
};

// POST new book (with authentication)
app.post('/api/books', requireAuth, (req, res) => {
    const newBook = req.body;
    
    // Validation
    if (!newBook.id || !newBook.title || !newBook.author) {
        return res.status(400).json({
            success: false,
            message: 'Book ID, title, and author are required fields'
        });
    }
    
    // Check if book ID already exists
    const existingBook = booksData.books.find(b => b.id === newBook.id);
    if (existingBook) {
        return res.status(400).json({
            success: false,
            message: `Book with ID ${newBook.id} already exists`
        });
    }
    
    // Set default values for optional fields
    const bookWithDefaults = {
        rating: 0,
        reviewCount: 0,
        inStock: true,
        featured: false,
        ...newBook
    };
    
    booksData.books.push(bookWithDefaults);
    
    if (writeJSONFile('books.json', booksData)) {
        res.status(201).json({
            success: true,
            message: 'Book added successfully',
            data: bookWithDefaults
        });
    } else {
        res.status(500).json({
            success: false,
            message: 'Failed to save book to database'
        });
    }
});

// POST new review (with authentication)
app.post('/api/reviews', requireAuth, (req, res) => {
    const newReview = req.body;
    
    // Validation
    if (!newReview.id || !newReview.bookId || !newReview.author || !newReview.rating) {
        return res.status(400).json({
            success: false,
            message: 'Review ID, bookId, author, and rating are required fields'
        });
    }
    
    // Check if book exists
    const book = booksData.books.find(b => b.id === newReview.bookId);
    if (!book) {
        return res.status(404).json({
            success: false,
            message: `Book with ID ${newReview.bookId} not found`
        });
    }
    
    // Check if review ID already exists
    const existingReview = reviewsData.reviews.find(r => r.id === newReview.id);
    if (existingReview) {
        return res.status(400).json({
            success: false,
            message: `Review with ID ${newReview.id} already exists`
        });
    }
    
    // Set default values
    const reviewWithDefaults = {
        timestamp: new Date().toISOString(),
        verified: false,
        ...newReview
    };
    
    reviewsData.reviews.push(reviewWithDefaults);
    
    // Update book's review count and rating (simplified average)
    book.reviewCount += 1;
    book.rating = ((book.rating * (book.reviewCount - 1)) + parseInt(newReview.rating)) / book.reviewCount;
    book.rating = parseFloat(book.rating.toFixed(1)); // Round to 1 decimal
    
    if (writeJSONFile('reviews.json', reviewsData) && writeJSONFile('books.json', booksData)) {
        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            data: reviewWithDefaults
        });
    } else {
        res.status(500).json({
            success: false,
            message: 'Failed to save review to database'
        });
    }
});

// ==================== ROOT ROUTE ====================

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to Amana Bookstore API',
        version: '1.0.0',
        endpoints: {
            books: {
                'GET /api/books': 'Get all books',
                'GET /api/books/:id': 'Get single book by ID',
                'GET /api/books/dates/:start/:end': 'Get books by date range',
                'GET /api/books/top-rated': 'Get top 10 rated books',
                'GET /api/books/featured': 'Get featured books',
                'POST /api/books': 'Add new book (requires authentication)'
            },
            reviews: {
                'GET /api/reviews/book/:bookId': 'Get reviews for a book',
                'POST /api/reviews': 'Add new review (requires authentication)'
            }
        },
        authentication: 'Use Authorization: Bearer amana-secret-token-2024 for POST routes'
    });
});

// ==================== ERROR HANDLING ====================

// 404 handler for undefined routes
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// ==================== START SERVER ====================

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Amana Bookstore API server running on port ${PORT}`);
    console.log(`📍 Access the API at: http://localhost:${PORT}`);
    console.log(`📚 Total books in catalog: ${booksData.books.length}`);
    console.log(`⭐ Featured books: ${booksData.books.filter(b => b.featured).length}`);
});

module.exports = app;