console.log('IT’S ALIVE!');

const BASE_PATH = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/" // Local server
    : "/portfolio/"; // Replace "portfolio" with your GitHub Pages repo name

let pages = [
    { url: '', title: 'Home' },
    { url: 'projects/', title: 'Projects' },
    { url: 'resume/', title: 'Resume' },
    { url: 'contact/', title: 'Contact' },
    { url: 'https://github.com/tachiu33333', title: 'GitHub' }
];

let nav = document.createElement('nav');
document.body.prepend(nav);

// Add the navigation links dynamically
for (let p of pages) {
    let url = p.url.startsWith('http') ? p.url : BASE_PATH + p.url;
    let a = document.createElement('a');
    a.href = url;
    a.textContent = p.title;

    // Highlight the current page
    a.classList.toggle(
        'current',
        a.host === location.host && a.pathname === location.pathname
    );

    // Open external links in a new tab
    if (a.host !== location.host) {
        a.target = "_blank";
    }

    nav.append(a);
}

// Preload internal links for faster navigation
for (let p of pages) {
    if (!p.url.startsWith('http')) {
        let link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = BASE_PATH + p.url;
        document.head.append(link);
    }
}

// Add the dark mode switch
document.body.insertAdjacentHTML(
    'afterbegin',
    `
    <label class="color-scheme">
        Theme:
        <select>
            <option value="auto">Automatic</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
        </select>
    </label>
    `
);

let select = document.querySelector('.color-scheme select');

// Handle theme changes
select.addEventListener('input', function (event) {
    const theme = event.target.value;
    if (theme === 'auto') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem('colorScheme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('colorScheme', theme);
    }
});

// Load saved theme preference
const savedTheme = localStorage.getItem('colorScheme');
if (savedTheme) {
    select.value = savedTheme;
    if (savedTheme !== 'auto') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
}

// Initialize EmailJS (replace 'YOUR_SERVICE_ID' and 'YOUR

const form = document.getElementById('contact-form');
form?.addEventListener('submit', (event) => {
    event.preventDefault(); // Prevent default form submission

    const data = new FormData(form);
    const params = new URLSearchParams();

    for (let [name, value] of data) {
        params.append(name, encodeURIComponent(value));
    }

    const mailtoUrl = `${form.action}?${params.toString()}`;
    location.href = mailtoUrl; // Open the mail client with the prefilled fields
});