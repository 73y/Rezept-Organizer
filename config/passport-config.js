//const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const connection = require('./database')
const bcrypt = require('bcrypt')
//const User = connection.models.User

async function initialize(passport, getUserByUsername) {
    const authenticateUser = (username, password, done) => {
        const user = getUserByUsername(username)
        if (user == null) {
            return done(null, false, { message: 'No user with that Username' })
        }

        try {
            if (await bcrypt.compare(password, user.password)) {
                return done(null, user)
            } else {
                return done(null, false, { message: 'Password incorrect'})
            }
        } catch (e) {
            return done(e)
        }
    }
 passport.use(new LocalStrategy({ usernameField: 'username'}), authenticateUser)
 passport.serializeUser((user, done) => {   })
 passport.deserializeUser((id, done) => {   })
}

module.exports = initialize