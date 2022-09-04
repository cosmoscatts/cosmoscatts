import axios from 'axios'
import dayjs from 'dayjs'
import { readFile, rm, writeFile } from 'fs/promises'
import { minify } from 'html-minifier'
import { shuffle } from 'lodash'
import MarkdownIt from 'markdown-it'
import rax from 'retry-axios'
import { motto, opensource, timeZone } from './config'
import { COMMNETS } from './constants'
import { GRepo } from './types'

const md = new MarkdownIt({
  html: true,
})
const githubAPIEndPoint = 'https://api.github.com'

rax.attach()
axios.defaults.raxConfig = {
  retry: 5,
  retryDelay: 4000,
  onRetryAttempt: (err) => {
    const cfg = rax.getConfig(err)
    console.log('request: \n', err.request)
    console.log(`Retry attempt #${cfg!.currentRetryAttempt}`)
  },
}

const gh = axios.create({
  baseURL: githubAPIEndPoint,
  timeout: 4000,
})

gh.interceptors.response.use(undefined, (err) => {
  console.log(err.message)
  return Promise.reject(err)
})


/**
 * 生成 `Projects` 结构
 */
function generateProjectsHTML(list: GRepo[]) {
  const tbody = list.reduce(
    (str, cur) =>
      str +
      ` <tr>
  <td><a href="${cur.html_url}" target="_blank"><b>
  ${cur.full_name}</b></a> ${
        cur.homepage ? `<a href="${cur.homepage}" target="_blank">🔗</a>` : ''
      }</td>
  <td><img alt="Stars" src="https://img.shields.io/github/stars/${
    cur.full_name
  }?style=flat-square&labelColor=343b41"/></td>
  <td>${new Date(cur.created_at).toLocaleDateString()}</td>
  <td>${new Date(cur.pushed_at).toLocaleDateString()}</td>
</tr>`,
    ``,
  )
  return m`<table>
  <thead align="center">
  <tr border: none;>
    <td><b>🎁 Projects</b></td>
    <td><b>⭐ Stars</b></td>
    <td><b>🕐 Create At</b></td>
    <td><b>📅 Last Active At</b></td>
  </tr>
</thead><tbody>
${tbody}
</tbody>
</table>`
}

async function main() {
  const template = await readFile('./readme.template.md', { encoding: 'utf-8' })
  let newContent = template

  // 获取写过的项目详情
  const limit = opensource.projects.limit
  const projects = opensource.projects.random
    ? shuffle(opensource.projects.repos).slice(0, limit)
    : opensource.projects.repos.slice(0, limit)
  const projectsProjectDetail: GRepo[] = await Promise.all(
    projects.map(async (name: string) => {
      const data = await gh.get('/repos/' + name)
      return data.data
    }),
  )

  newContent = newContent
    .replace(gc('OPENSOURCE_PROJECTS'), generateProjectsHTML(projectsProjectDetail))

  // 注入 FOOTER
  {
    const now = new Date()
    const next = dayjs().add(24, 'h').toDate()

    newContent = newContent.replace(
      gc('FOOTER'),
      m`
    <p align="center">此文件 <i>README</i> <b>间隔 24 小时</b>自动刷新生成！
    </br>
    刷新于：${now.toLocaleString(undefined, {
      timeStyle: 'short',
      dateStyle: 'short',
      timeZone,
    })}
    <br/>
    下一次刷新：${next.toLocaleString(undefined, {
      timeStyle: 'short',
      dateStyle: 'short',
      timeZone,
    })}</p>
    `,
    )
  }

  newContent = newContent.replace(gc('MOTTO'), motto)
  await rm('./readme.md', { force: true })
  await writeFile('./readme.md', newContent, { encoding: 'utf-8' })

  const result = md.render(newContent)
  await writeFile('./index.html', result, { encoding: 'utf-8' })
}

function gc(token: keyof typeof COMMNETS) {
  return `<!-- ${COMMNETS[token]} -->`
}

function m(html: TemplateStringsArray, ...args: any[]) {
  const str = html.reduce((s, h, i) => s + h + (args[i] ?? ''), '')
  return minify(str, {
    removeAttributeQuotes: true,
    removeEmptyAttributes: true,
    removeTagWhitespace: true,
    collapseWhitespace: true,
  }).trim()
}

main()
