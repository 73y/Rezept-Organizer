const mongoose = require('mongoose')
const User = require('./userSchema')
const Ingredient = require('./ingredientSchema')

const recipeSchema = mongoose.Schema({
    title: String,
    description: String,
    ingredientList: [{
      ingredient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingredient'
      },
      quantity: {
        type: Number,
        required: true
      }
    }],
    createdAt: {
        type: Date,
        immutable: true,
        default: () => Date.now(),
    },
    updatedAt: {
        type: Date,
        default: () => Date.now(),
    },
    cookingtime: Number,
    instructions: [String],
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        validate: {
            validator: (v) => User.findById(v),
            message: 'Ungültiger Benutzer'
        }
    }
})

const recipe = mongoose.model('Rezepte', recipeSchema)
module.exports = recipe