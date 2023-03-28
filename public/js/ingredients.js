class ingredient {
    constructor(name, purchaseQuantity, purchasePrice, unit, category) {
        this.name = name,
        this.purchaseQuantity = purchaseQuantity,
        this.purchasePrice = purchasePrice,
        this.unit = unit,
        this.category = category
    }
}
const addButton = document.getElementById('add-ingredient')
const tbody = document.getElementById('tbody')
const table = document.getElementById('table')

//addFromDatabase() {
//    fetch()
//}
//addFromDatabase()
addButton.addEventListener('click', () => {
    addIngredientRow()
})

tbody.addEventListener("click", function(event) {
    if (event.target.tagName === "TD") {
        makeCellEditable(event.target);
    }
});

//small functions

function addIngredientRow (name = "?", purchaseQuantity = "?", purchasePrice = "?", unit = "?", category = "?") {
    //lookingForInput(categorie, ingredientName, purchasePrice, purchaseQuantity)
    let newRow = document.createElement("tr");
    let cell1 = document.createElement("td");
    let cell2 = document.createElement("td");
    let cell3 = document.createElement("td");
    let cell4 = document.createElement("td");

    cell2.innerHTML = category;
    cell1.innerHTML = name;
    cell3.innerHTML = `${purchaseQuantity} ${unit}`;
    cell4.innerHTML = `${purchasePrice}€`;

    newRow.appendChild(cell1);
    newRow.appendChild(cell2);
    newRow.appendChild(cell3);
    newRow.appendChild(cell4);

    tbody.appendChild(newRow);
}

function makeCellEditable(cell) {
    let input = document.createElement("input");
    input.setAttribute("type", "text");
    input.value = cell.textContent;
    console.log(cell)
    cell.innerHTML = "";
    cell.appendChild(input);
    input.focus();
    input.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            cell.innerHTML = input.value;
            addToDataBase(input.value)
        }
    });
}

function addToDataBase (data) {
    console.log(data)
}