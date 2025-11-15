import { fetchJSON } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let projects = await fetchJSON('../lib/projects.json');
let query = '';
let selectedYear = null;
let pieChartData = [];

const projectsContainer = document.querySelector('.projects');
const searchInput = document.querySelector('.searchBar');

const barContainer = document.createElement('div');
barContainer.className = 'bar-container';
barContainer.style.textAlign = 'center';
barContainer.style.marginTop = '1rem';
document.querySelector('.container').appendChild(barContainer);

function updateBarContent(content) {
    barContainer.textContent = content || 'Hover or click on a slice to see details.';
}

function renderProjects(filteredProjects, container, headingTag) {
    container.innerHTML = '';
    filteredProjects.forEach((project) => {
        const projectElement = document.createElement('article');
        // Handle relative image paths - if it doesn't start with http, prepend BASE_PATH
        let imageSrc = project.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect width="400" height="300" fill="%23f0f0f0"/%3E%3C/svg%3E';
        if (!imageSrc.startsWith('http') && !imageSrc.startsWith('data:')) {
            imageSrc = '../' + imageSrc;
        }
        projectElement.innerHTML = `
            <${headingTag}>${project.title}</${headingTag}>
            <p>${project.description}</p>
            <p style="font-family: Baskerville; font-variant-numeric: oldstyle-nums; color: var(--color-muted);">${project.year}</p>
            <img src="${imageSrc}" alt="${project.title}" />
        `;
        container.appendChild(projectElement);
    });
}

function applyFilters() {
    const filteredProjects = projects.filter((project) => {
        const matchesQuery = query
            ? Object.values(project).join('\n').toLowerCase().includes(query)
            : true;
        const matchesSelectedYear =
            selectedYear !== null
                ? project.year === selectedYear
                : true;
        return matchesQuery && matchesSelectedYear;
    });

    renderProjects(filteredProjects, projectsContainer, 'h2');
}

function renderPieChartAll() {
    // Always render pie chart with ALL projects, independent of filters
    renderPieChart(projects);
}

function renderPieChart(projectsGiven) {
    const rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year
    );

    pieChartData = rolledData.map(([year, count]) => ({
        value: count,
        label: year,
    }));

    const colors = d3.scaleOrdinal(d3.schemeTableau10).range(
        d3.schemeTableau10.map((color) => d3.color(color).brighter(1.5).formatHex())
    );

    const sliceGenerator = d3.pie().value((d) => d.value);
    const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

    const svg = d3.select('#projects-pie-plot');
    svg.selectAll('path').remove();

    const pieSlices = sliceGenerator(pieChartData);
    const arcs = pieSlices.map((d) => arcGenerator(d));
    
    arcs.forEach((arc, i) => {
        const isSelected = selectedYear === pieChartData[i].label;
        // Darken the color if selected, otherwise use normal color
        const fillColor = isSelected 
            ? d3.color(colors(i)).darker(0.3).formatHex()
            : colors(i);
        const path = svg
            .append('path')
            .attr('d', arc)
            .attr('fill', fillColor)
            .attr('class', '')
            .on('mouseover', () => {
                if (selectedYear !== pieChartData[i].label) {
                    updateBarContent(`Year: ${pieChartData[i].label}, Projects: ${pieChartData[i].value}`);
                }
            })
            .on('mouseout', () => {
                updateBarContent(selectedYear === null ? null : `Year: ${selectedYear}, Projects: ${pieChartData.find(d => d.label === selectedYear)?.value || ''}`);
            })
            .on('click', function () {
                // Toggle selection
                const year = pieChartData[i].label;
                selectedYear = selectedYear === year ? null : year;

                // Update pie chart visual (to show selection) and filter projects list
                renderPieChartAll(); // Re-render pie chart with all projects
                applyFilters(); // Filter the projects list
            });
    });

    const legend = d3.select('.legend');
    legend.selectAll('li').remove();
    pieChartData.forEach((d, idx) => {
        const isSelected = selectedYear === d.label;
        legend
            .append('li')
            .attr('style', `--color:${colors(idx)}`)
            .attr('class', isSelected ? 'selected' : '')
            .html(
                `<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`
            )
            .on('mouseover', () => {
                if (!isSelected) {
                    updateBarContent(`Year: ${d.label}, Projects: ${d.value}`);
                }
            })
            .on('mouseout', () => {
                updateBarContent(selectedYear === null ? null : `Year: ${selectedYear}, Projects: ${pieChartData.find(d => d.label === selectedYear)?.value || ''}`);
            })
            .on('click', () => {
                selectedYear = selectedYear === d.label ? null : d.label;
                // Update pie chart visual (to show selection) and filter projects list
                renderPieChartAll(); // Re-render pie chart with all projects
                applyFilters(); // Filter the projects list
            });
    });
}

searchInput.addEventListener('input', (event) => {
    query = event.target.value.toLowerCase();
    applyFilters();
});

// Initial render
renderPieChartAll(); // Render pie chart with all projects
applyFilters(); // Render projects list