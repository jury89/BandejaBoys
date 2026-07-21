const WORKFLOW_DISPATCH_URL =
  'https://api.github.com/repos/jury89/BandejaBoys/actions/workflows/notifications.yml/dispatches'

export async function dispatchNotificationWorkflow(githubToken, fetcher = fetch) {
  if (!githubToken) {
    throw new Error('Missing GITHUB_TOKEN secret')
  }

  const response = await fetcher(WORKFLOW_DISPATCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${githubToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'bandeja-boys-notification-scheduler',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main' }),
  })

  if (response.status !== 204) {
    const details = (await response.text()).slice(0, 240)
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${details}`)
  }
}

export default {
  scheduled(_controller, env, context) {
    context.waitUntil(dispatchNotificationWorkflow(env.GITHUB_TOKEN))
  },
}
