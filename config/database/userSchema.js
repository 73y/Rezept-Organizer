const mongoose = require('mongoose')
const Recipe = require('./recipeSchema')
const Ingredient = require('./ingredientSchema')
//const List = require('./list')

const userSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    recipeList: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: Recipe
    }],
    ingredientList: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: Ingredient
    }],/*
    list: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: List
    }]*/
})

const User = mongoose.model('User', userSchema)

module.exports = User