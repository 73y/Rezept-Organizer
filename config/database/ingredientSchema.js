const mongoose = require('mongoose')
const User = require('./userSchema')

const ingredientSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    purchaseQuantity: Number,
    purchasePrice: Number,
    unit: String,
    category: String,
    createdAt: {
        type: Date,
        immutable: true,
        default: () => Date.now(),
    },
    updatedAt: {
        type: Date,
        default: () => Date.now(),
    },
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

const Ingredient = mongoose.model('Ingredient', ingredientSchema)
module.exports = Ingredient