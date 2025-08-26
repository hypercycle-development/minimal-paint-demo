// app.js
import HomePage from './home.js';

const m = window.m;

const App = {
    view: () => m('div', [
      m(HomePage)  // Use the imported component
    ])
};

m.mount(document.getElementById('app'), App);
