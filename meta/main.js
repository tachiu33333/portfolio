import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

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

// Global variables for scales
let xScale, yScale;

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
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale).tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

  svg.append('g')
    .attr('transform', `translate(0,${usableArea.bottom})`)
    .call(xAxis);
  
  svg.append('g')
    .attr('transform', `translate(${usableArea.left},0)`)
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
    .data(sortedCommits)
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

// Render the scatterplot
renderScatterPlot(data, commits);