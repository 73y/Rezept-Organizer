const express = require('express')
const router = express.Router()

router.get('/', (req, res) => {
    res.render('shoppingList.ejs')
})

module.exports = router