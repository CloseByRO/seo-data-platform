/**
 * Create a private GitHub repository (REST API). Repo name = client slug.
 */

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

/**
 * @param {{ token: string; owner: string; repoName: string; reuseIfExists?: boolean }} opts
 * @returns {Promise<{ ok: true; fullName: string } | { ok: false; error: string; status?: number }>}
 */
export async function createGitHubPrivateRepo(opts) {
  const { token, owner, repoName, reuseIfExists = false } = opts
  const auth = { ...GH_HEADERS, Authorization: `Bearer ${token}` }

  const userRes = await fetch('https://api.github.com/user', { headers: auth })
  if (!userRes.ok) {
    return { ok: false, error: `GitHub /user: ${userRes.status} ${await userRes.text()}`, status: userRes.status }
  }
  const user = await userRes.json()
  const login = user.login

  const isUserOwner = login.toLowerCase() === owner.toLowerCase()
  const url = isUserOwner
    ? 'https://api.github.com/user/repos'
    : `https://api.github.com/orgs/${encodeURIComponent(owner)}/repos`

  const body = JSON.stringify({
    name: repoName,
    private: true,
    auto_init: false,
    description: 'Client site (CloseBy onboarding)',
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body,
  })

  if (res.status === 201) {
    const data = await res.json()
    return { ok: true, fullName: data.full_name }
  }

  const text = await res.text()
  // Duplicate name: GitHub returns 422 with "name already exists"
  if ((res.status === 422 || res.status === 409) && reuseIfExists) {
    console.warn(
      `GitHub repo ${owner}/${repoName} already exists — continuing (GITHUB_REPO_EXISTS=reuse).`
    )
    return { ok: true, fullName: `${owner}/${repoName}` }
  }

  if (res.status === 404 && !isUserOwner) {
    return {
      ok: false,
      error:
        `GitHub ${res.status}: org "${owner}" not found or token cannot create repos there. ` +
          'Use a token with org admin/repo scope, or set GITHUB_OWNER to your user login.',
      status: res.status,
    }
  }

  if (res.status === 403 && !isUserOwner) {
    return {
      ok: false,
      error:
        `GitHub ${res.status}: token cannot create repos in org "${owner}". ` +
        'Ensure the token has permission and your user has org rights (often requires org owner/admin). ' +
        'If you want to deploy under a personal account instead, set GITHUB_OWNER to your user login.',
      status: res.status,
    }
  }

  return {
    ok: false,
    error: `GitHub create repo ${res.status}: ${text}`,
    status: res.status,
  }
}
