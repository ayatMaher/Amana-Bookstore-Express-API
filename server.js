const express = require('express');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================

// Morgan logging to file
const logStream = fs.createWriteStream(path.join(__dirname, 'logging', 'log.txt'), { flags: 'a' });
app.use(morgan('combined', { stream: logStream }));

// Morgan logging to console
app.use(morgan('dev'));

// JSON parsing middleware
app.use(express.json());

// ==================== HELPER FUNCTIONS ====================

// Read JSON files
const readJSONFile = (filename) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'data', filename), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filename}:`, error);
        return { books: [], reviews: [] };
    }
};

// Write JSON files
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

// ==================== AUTHENTICATION MIDDLEWARE ====================
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    // Check if authorization header exists and has the correct token
    if (!authHeader || authHeader !== 'Bearer amana-secret-token-2024') {
        return res.status(401).json({
            success: false,
            message: 'Authentication required. Please provide valid authorization token.'
        });
    }
    
    next();
};

// ==================== GET ROUTES ====================

// Root route
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

// GET top 10 rated books (rating * reviewCount)
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

// GET book by ID
app.get('/api/books/:id', (req, res) => {
    const book = booksData.books.find(b => b.id === req.params.id);
    if (!book) {
        return res.status(404).json({ 
            success: false, 
            message: `Book with ID ${req.params.id} not found` 
        });
    }
    res.json({ 
        success: true, 
        data: book 
    });
});

// GET reviews for book
app.get('/api/reviews/book/:bookId', (req, res) => {
    const bookReviews = reviewsData.reviews.filter(review => review.bookId === req.params.bookId);
    
    // Check if book exists
    const book = booksData.books.find(b => b.id === req.params.bookId);
    if (!book) {
        return res.status(404).json({
            success: false,
            message: `Book with ID ${req.params.bookId} not found`
        });
    }
    
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
        image: "/images/default-book.jpg",
        ...newBook
    };
    
    // Add to books array
    booksData.books.push(bookWithDefaults);
    
    // Save to file
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
    
    // Validate rating
    const rating = parseFloat(newReview.rating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({
            success: false,
            message: 'Rating must be a number between 1 and 5'
        });
    }
    
    // Set default values
    const reviewWithDefaults = {
        timestamp: new Date().toISOString(),
        verified: false,
        ...newReview,
        rating: rating
    };
    
    // Add to reviews array
    reviewsData.reviews.push(reviewWithDefaults);
    
    // Update book's review count and rating
    book.reviewCount += 1;
    book.rating = ((book.rating * (book.reviewCount - 1)) + rating) / book.reviewCount;
    book.rating = parseFloat(book.rating.toFixed(1)); // Round to 1 decimal
    
    // Save both files
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

// ==================== ERROR HANDLING ====================

// 404 handler
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
    console.log(`📝 Total reviews: ${reviewsData.reviews.length}`);
    console.log(`📊 Morgan logging enabled - check logging/log.txt`);
});

module.exports = app;