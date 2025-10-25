import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

const projects = await fetchJSON('./lib/projects.json');
console.log('All projects:', projects); // Debugging log
const latestProjects = projects.slice(0, 3);
console.log('Latest projects:', latestProjects); // Debugging log

const projectsContainer = document.querySelector('.projects');
console.log('Projects container:', projectsContainer); // Debugging log

const githubData = await fetchGitHubData('tachiu33333');
console.log('GitHub data:', githubData); // Debugging log
const profileStats = document.querySelector('#profile-stats');

setTimeout(() => {
  renderProjects(latestProjects, projectsContainer, 'h2');
  if (profileStats) {
    profileStats.innerHTML = `
      <dl>
        <dt>Public Repos:</dt><dd>${githubData.public_repos}</dd>
        <dt>Public Gists:</dt><dd>${githubData.public_gists}</dd>
        <dt>Followers:</dt><dd>${githubData.followers}</dd>
        <dt>Following:</dt><dd>${githubData.following}</dd>
      </dl>
    `;
  }
}, 100);