const MongoStore = require('connect-mongo')(session)

const sessionStore = new MongoStore({ mongooseConnection: connection, collection: 'sessions' })
app.use(session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 Day
    }
}))