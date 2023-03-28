const menuOpener = document.getElementById('menuOpener')
const navbar = document.getElementById('navbar')
const main = document.getElementById('main')
menuOpener.addEventListener('click', ()=>{
    if (navbar.classList.contains('openNavbar')) {
        removeClasses()
    } else {
        addClasses()
    }
})

function removeClasses () {
    const menuLabels = document.querySelectorAll('.link-text');
    navbar.classList.remove('openNavbar')
    main.classList.remove('openNavbar')
    menuLabels.forEach(element => {
        element.classList.add('hide')
    });
}

function addClasses () {
    const menuLabels = document.querySelectorAll('.link-text');
    navbar.classList.add('openNavbar')
    main.classList.add('openNavbar')
    menuLabels.forEach(element => {
        element.classList.remove('hide')
    });
}