import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: +row.line,
    depth: +row.depth,
    length: +row.length,
    date: row.date,
    time: row.time || '00:00',
    timezone: row.timezone || '+00:00',
    datetime: new Date(row.datetime || `${row.date}T${row.time || '00:00'}${row.timezone || '+00:00'}`),
  }));
  return data;
}

let data = await loadData();

function processCommits(data) {
  return d3.groups(data, (d) => d.commit).map(([commit, lines]) => {
    let first = lines[0];
    let { author, date, time, timezone, datetime } = first;
    let ret = {
      id: commit,
      url: 'https://github.com/tachiu33333/portfolio/commit/' + commit,
      author,
      date,
      time,
      timezone,
      datetime,
      hourFrac: (datetime && !isNaN(datetime)) ? datetime.getHours() + (datetime.getMinutes() / 60) : 0,
      totalLines: lines.length,
    };
    Object.defineProperty(ret, 'lines', { 
      value: lines,
      enumerable: false,
      configurable: true,
      writable: true
    });
    return ret;
  });
}

let commits = processCommits(data);

// Sort commits by datetime for proper ordering
commits = d3.sort(commits, (a, b) => a.datetime - b.datetime);

// Global variables for scales
let xScale, yScale;

// Time filtering variables
let commitProgress = 100;
let timeScale = d3
  .scaleTime()
  .domain([
    d3.min(commits, (d) => d.datetime),
    d3.max(commits, (d) => d.datetime),
  ])
  .range([0, 100]);
let commitMaxTime = timeScale.invert(commitProgress);
let filteredCommits = commits;

// Summary stats rendering
function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of Code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  const totalLinesPerCommit = commits.map(d => d.totalLines);
  dl.append('dt').text('Max lines edited (single commit)');
  dl.append('dd').text(d3.max(totalLinesPerCommit) || 0);

  dl.append('dt').text('Mean lines per commit');
  dl.append('dd').text((d3.mean(totalLinesPerCommit) || 0).toFixed(2));

  dl.append('dt').text('Earliest commit');
  dl.append('dd').text(d3.min(commits, d => d.datetime)?.toLocaleString() || 'N/A');

  dl.append('dt').text('Latest commit');
  dl.append('dd').text(d3.max(commits, d => d.datetime)?.toLocaleString() || 'N/A');
}

renderCommitInfo(data, commits);

// Scatterplot rendering
function renderScatterPlot(data, commits) {
  const width = 1000, height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const usableArea = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('overflow', 'visible');

  xScale = d3.scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .nice()
    .range([usableArea.left, usableArea.right]);

  yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  // Axes
  const xAxis = d3.axisBottom(xScale)
    .tickFormat(d3.timeFormat('%a %b %d'));
  const yAxis = d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg.append('g')
    .attr('transform', `translate(0,${usableArea.bottom})`)
    .attr('class', 'x-axis')
    .call(xAxis);
  
  svg.append('g')
    .attr('transform', `translate(${usableArea.left},0)`)
    .attr('class', 'y-axis')
    .call(yAxis);

  // Gridlines
  svg.append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left},0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  // Radius scale
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt()
    .domain([minLines || 0, maxLines || 1])
    .range([2, 30]);

  // Dots
  const dots = svg.append('g').attr('class', 'dots');

  const sortedCommits = d3.sort(commits, (a, b) => d3.descending(a.totalLines, b.totalLines));

  dots.selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => {
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  // Initialize brush AFTER dots are rendered
  svg.call(d3.brush().on('start brush end', brushed));
  svg.selectAll('.dots, .overlay ~ *').raise();
}

// Brush event handler
function brushed(event) {
  const selection = event.selection;
  
  d3.selectAll('circle').classed('selected', (d) =>
    isCommitSelected(selection, d)
  );
  
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

// Check if commit is within brush selection
function isCommitSelected(selection, commit) {
  if (!selection) {
    return false;
  }
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Render selection count
function renderSelectionCount(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  if (countElement) {
    countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;
  }

  return selectedCommits;
}

// Render language breakdown
function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  
  const container = document.getElementById('language-breakdown');
  if (!container) return;

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);

  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);

    container.innerHTML += `
      <dt>${language}</dt>
      <dd>${count} lines (${formatted})</dd>
    `;
  }
}

// Tooltip helpers
function renderTooltipContent(commit) {
  const link = document.getElementById('commit-link');
  const date = document.getElementById('commit-date');
  if (!commit || !commit.id) return;
  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime 
    ? commit.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' }) 
    : `${commit.date || ''} ${commit.time || ''}`;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  if (tooltip) {
    tooltip.hidden = !isVisible;
  }
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  if (!tooltip) return;
  
  const offsetX = 12, offsetY = 12;
  let left = event.clientX + offsetX;
  let top = event.clientY + offsetY;

  const rect = tooltip.getBoundingClientRect();
  if (left + rect.width > window.innerWidth) {
    left = event.clientX - rect.width - offsetX;
  }
  if (top + rect.height > window.innerHeight) {
    top = event.clientY - rect.height - offsetY;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Update scatter plot function
function updateScatterPlot(data, commits) {
  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const svg = d3.select('#chart').select('svg');

  xScale = xScale.domain(d3.extent(commits, (d) => d.datetime));

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines || 0, maxLines || 1]).range([2, 30]);

  const xAxis = d3.axisBottom(xScale)
    .tickFormat(d3.timeFormat('%a %b %d'));

  // Update x-axis
  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);

  const dots = svg.select('g.dots');

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);
  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });
}

// Time slider change handler
function onTimeSliderChange() {
  const slider = document.getElementById('commit-progress');
  commitProgress = parseFloat(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);
  
  const timeElement = document.getElementById('commit-time');
  if (timeElement) {
    timeElement.textContent = commitMaxTime.toLocaleString('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  }

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  
  updateScatterPlot(data, filteredCommits);
  updateCommitInfo(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

// Update commit info function
function updateCommitInfo(data, commits) {
  const dl = d3.select('#stats').select('dl.stats');
  if (dl.empty()) return;
  
  const filteredData = commits.flatMap((c) => c.lines);
  const totalLinesPerCommit = commits.length > 0 ? commits.map(d => d.totalLines) : [0];
  
  const stats = [
    filteredData.length,
    commits.length,
    d3.max(totalLinesPerCommit) || 0,
    commits.length > 0 ? (d3.mean(totalLinesPerCommit) || 0).toFixed(2) : '0.00',
    commits.length > 0 ? (d3.min(commits, d => d.datetime)?.toLocaleString() || 'N/A') : 'N/A',
    commits.length > 0 ? (d3.max(commits, d => d.datetime)?.toLocaleString() || 'N/A') : 'N/A',
  ];
  
  dl.selectAll('dd')
    .data(stats)
    .text((d) => String(d));
}

// Render the scatterplot
renderScatterPlot(data, commits);

// Unit visualization for files
function updateFileDisplay(filteredCommits) {
  let lines = filteredCommits.flatMap((d) => d.lines);
  let files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => {
      return { name, lines };
    })
    .sort((a, b) => b.lines.length - a.lines.length);

  let filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join(
      (enter) =>
        enter.append('div').call((div) => {
          div.append('dt').append('code');
          div.append('dd');
        }),
    );

  filesContainer.select('dt > code').html((d) => {
    return `${d.name} <small>${d.lines.length} lines</small>`;
  });

  const colors = d3.scaleOrdinal(d3.schemeTableau10);
  
  filesContainer
    .select('dd')
    .selectAll('div')
    .data((d) => d.lines)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${colors(d.type)}`);
}

// Generate commit text for scrollytelling
d3.select('#scatter-story')
  .selectAll('.step')
  .data(commits)
  .join('div')
  .attr('class', 'step')
  .html(
    (d, i) => {
      // First commit gets custom message
      if (i === 0) {
        return `On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })},
  I created the website and set up the foundation for what would soon be the current website using HTML.
  I made <a href="${d.url}" target="_blank">my first commit</a>.
  I edited ${d.totalLines} lines across ${
          d3.rollups(
            d.lines,
            (D) => D.length,
            (d) => d.file,
          ).length
        } files.`;
      }
      
      // Commit #4 (index 3) gets custom message
      if (i === 3) {
        return `On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })}, in this <a href="${d.url}" target="_blank">commit</a>, I added content to my resume and then implemented new transitions and better styling to my website utilizing CSS.`;
      }
      
      // Commit #6 (index 5) gets custom message
      if (i === 5) {
        return `On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })}, I made another <a href="${d.url}" target="_blank">commit</a> where I integrated Javascript in which I made small animation through fading and reinvented the navigation bar. I also remade the email section to better write one towards me.`;
      }
      
      // First commit on October 24, 2025 (6:14 PM) gets custom message
      const isOct24 = d.datetime.getFullYear() === 2025 && 
                       d.datetime.getMonth() === 9 && 
                       d.datetime.getDate() === 24;
      const isFirstOct24 = isOct24 && (i === 0 || 
        (commits[i - 1] && (
          commits[i - 1].datetime.getFullYear() !== 2025 ||
          commits[i - 1].datetime.getMonth() !== 9 ||
          commits[i - 1].datetime.getDate() !== 24
        )));
      
      if (isFirstOct24) {
        return `On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })}, I made another <a href="${d.url}" target="_blank">commit</a>. In this one, I made a project page to showcase everything I have done so far in a neat and easy to read area as well as reorganizing my website to look more appealing.`;
      }
      
      // October 31, 2025 commit gets custom message
      const isOct31 = d.datetime.getFullYear() === 2025 && 
                       d.datetime.getMonth() === 9 && 
                       d.datetime.getDate() === 31;
      
      if (isOct31) {
        return `On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })}, I made another <a href="${d.url}" target="_blank">commit</a>. I included a new way to search for my projects through either a search bar or an interactive wheel utilzing D3.`;
      }
      
      // November 8, 2025 at 11:46 PM commit gets custom message
      const isNov8 = d.datetime.getFullYear() === 2025 && 
                      d.datetime.getMonth() === 10 && 
                      d.datetime.getDate() === 8 &&
                      d.datetime.getHours() === 23 &&
                      d.datetime.getMinutes() === 46;
      
      if (isNov8) {
        return `On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })}, I made another <a href="${d.url}" target="_blank">commit</a>. I included a new way to see the metric of my github. It features how many activites I had throughout my account's history.`;
      }
      
      // Most recent commit (lab work) gets custom message
      if (i === commits.length - 1) {
        return `On ${d.datetime.toLocaleString('en', {
          dateStyle: 'full',
          timeStyle: 'short',
        })}, I made another <a href="${d.url}" target="_blank">commit</a>. In this lab, I created an interactive timeline visualization with a slider to filter commits by time and built narrative that updates the visualizations as users scroll through the commit history.`;
      }
      
      // All other commits use simpler template
      return `On ${d.datetime.toLocaleString('en', {
        dateStyle: 'full',
        timeStyle: 'short',
      })}, I made another commit. I edited ${d.totalLines} lines across ${
        d3.rollups(
          d.lines,
          (D) => D.length,
          (d) => d.file,
        ).length
      } files.`;
    }
  );

// Scrollama integration
function onStepEnter(response) {
  const commit = response.element.__data__;
  if (!commit) return;
  
  commitMaxTime = commit.datetime;
  commitProgress = timeScale(commitMaxTime);
  
  const slider = document.getElementById('commit-progress');
  if (slider) {
    slider.value = commitProgress;
  }
  
  const timeElement = document.getElementById('commit-time');
  if (timeElement) {
    timeElement.textContent = commitMaxTime.toLocaleString('en', {
      dateStyle: 'long',
      timeStyle: 'short',
    });
  }

  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  
  updateScatterPlot(data, filteredCommits);
  updateCommitInfo(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

const scroller = scrollama();
scroller
  .setup({
    container: '#scrolly-1',
    step: '#scrolly-1 .step',
  })
  .onStepEnter(onStepEnter);

// Initialize slider
const slider = document.getElementById('commit-progress');
if (slider) {
  slider.addEventListener('input', onTimeSliderChange);
  onTimeSliderChange(); // Initialize on page load
}