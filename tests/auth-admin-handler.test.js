const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { createAuthAdminHandler } = require('../api/auth-admin/route-handlers.js');

function createDeps(overrides = {}) {
  const state = {
    users: new Map(),
    puts: [],
    sessions: []
  };
  const deps = {
    init: async () => {},
    get: async (table, id) => state.users.get(id) || null,
    put: async (table, id, row) => {
      state.users.set(id, row);
      state.puts.push({ table, id, row });
    },
    getCachedRow: async (table, id) => state.users.get(id) || null,
    getCachedScan: async () => [...state.users.values()],
    bcrypt: {
      compare: async (input, hashed) => hashed === `hashed:${input}`,
      hash: async (input) => `hashed:${input}`
    },
    jwt: {
      sign: (payload) => {
        state.sessions.push(payload);
        return `token:${payload.id}`;
      }
    },
    fetchWechatSession: async (code) => ({ openid: `openid:${code}` }),
    extractWechatOpenId: (session) => session.openid,
    mergeStoredAuthUser: (tokenUser, storedUser) => ({
      id: storedUser.id,
      name: storedUser.name,
      role: storedUser.role,
      status: storedUser.status || 'active',
      coachId: storedUser.coachId || '',
      coachName: storedUser.coachName || '',
      matchPermissions: storedUser.matchPermissions || []
    }),
    assertAuthUserActive: (user) => {
      if (user.status === 'inactive') throw new Error('账号已停用');
    },
    userMatchPermissions: ({ matchPermissions }) => Array.isArray(matchPermissions) ? matchPermissions.filter(Boolean) : [],
    buildWechatBoundUser: (user, openid) => ({ ...user, wechatOpenId: openid, wechatBoundAt: 'BOUND_AT' }),
    buildWechatUnboundUser: (user) => ({ ...user, wechatOpenId: '', wechatBoundAt: '' }),
    buildAdminUserView: (user) => ({
      id: user.id,
      name: user.name,
      phone: user.phone || '',
      role: user.role,
      status: user.status || 'active',
      coachId: user.coachId || '',
      coachName: user.coachName || '',
      matchPermissions: user.matchPermissions || [],
      wechatBound: !!user.wechatOpenId
    }),
    assertPhone: (value) => String(value || '').trim(),
    isTableMissingError: () => false,
    tables: {
      users: 'ft_users'
    },
    loginRowTimeoutMs: 5,
    loginScanTimeoutMs: 5,
    ...overrides
  };
  return { deps, state };
}

(async () => {
  {
    const { deps, state } = createDeps();
    state.users.set('admin', {
      id: 'admin',
      name: '管理员',
      role: 'admin',
      status: 'active',
      password: 'hashed:123456'
    });
    const handler = createAuthAdminHandler(deps);
    const response = await handler({
      path: '/auth/login',
      method: 'POST',
      body: { username: 'admin', password: '123456' },
      user: null
    });
    assert.deepStrictEqual(response, {
      body: {
        token: 'token:admin',
        user: {
          id: 'admin',
          name: '管理员',
          role: 'admin',
          status: 'active',
          coachId: '',
          coachName: '',
          matchPermissions: []
        }
      }
    });
  }

  {
    const { deps, state } = createDeps();
    const handler = createAuthAdminHandler(deps);
    const response = await handler({
      path: '/admin/create-user',
      method: 'POST',
      user: { id: 'admin', role: 'admin' },
      body: {
        id: 'coach-a',
        name: '教练A',
        phone: '13800138000',
        password: 'abc123',
        permissions: ['match_ops']
      }
    });
    assert.deepStrictEqual(response, {
      body: {
        success: true,
        id: 'coach-a',
        name: '教练A',
        role: 'editor',
        status: 'active',
        coachId: '',
        coachName: '教练A',
        matchPermissions: ['match_ops']
      }
    });
    assert.strictEqual(state.users.get('coach-a').password, 'hashed:abc123');
    assert.strictEqual(state.users.get('coach-a').phone, '13800138000');
  }

  {
    const { deps, state } = createDeps();
    state.users.set('coach-a', {
      id: 'coach-a',
      name: '教练A',
      role: 'editor',
      status: 'active',
      coachId: 'coach-a',
      coachName: '教练A',
      wechatOpenId: 'openid:old',
      wechatBoundAt: 'OLD',
      matchPermissions: []
    });
    const handler = createAuthAdminHandler(deps);
    const response = await handler({
      path: '/admin/update-user',
      method: 'POST',
      user: { id: 'admin', role: 'admin' },
      body: {
        id: 'coach-a',
        name: '教练A2',
        phone: '13900139000',
        clearWechat: true,
        permissions: ['match_finance']
      }
    });
    assert.deepStrictEqual(response, { body: { success: true } });
    assert.deepStrictEqual(state.users.get('coach-a'), {
      id: 'coach-a',
      name: '教练A2',
      phone: '13900139000',
      role: 'editor',
      status: 'active',
      coachId: '',
      coachName: '教练A2',
      wechatOpenId: '',
      wechatBoundAt: '',
      matchPermissions: ['match_finance']
    });
  }

  {
    const { deps, state } = createDeps();
    state.users.set('coach-a', {
      id: 'coach-a',
      name: '教练A',
      role: 'editor',
      status: 'active',
      password: 'hashed:old-pass'
    });
    const handler = createAuthAdminHandler(deps);
    const response = await handler({
      path: '/auth/change-password',
      method: 'POST',
      user: { id: 'coach-a', role: 'editor' },
      body: { oldPassword: 'old-pass', newPassword: 'new-pass' }
    });
    assert.deepStrictEqual(response, { body: { success: true } });
    assert.strictEqual(state.users.get('coach-a').password, 'hashed:new-pass');
  }

  {
    const { deps, state } = createDeps();
    state.users.set('coach-a', {
      id: 'coach-a',
      name: '教练A',
      role: 'editor',
      status: 'active'
    });
    const handler = createAuthAdminHandler(deps);
    const response = await handler({
      path: '/auth/wechat-bind',
      method: 'POST',
      user: { id: 'coach-a', role: 'editor' },
      body: { code: 'bind-1' }
    });
    assert.deepStrictEqual(response, { body: { success: true, wechatBound: true } });
    assert.strictEqual(state.users.get('coach-a').wechatOpenId, 'openid:bind-1');
  }

  {
    const { deps } = createDeps({
      getCachedRow: async () => new Promise((resolve, reject) => setTimeout(() => reject(new Error('ETIMEDOUT')), 20)),
      getCachedScan: async () => [{
        id: 'coach-timeout',
        name: '超时回退教练',
        role: 'editor',
        status: 'active',
        password: 'hashed:pass-1'
      }]
    });
    const handler = createAuthAdminHandler(deps);
    const response = await handler({
      path: '/auth/login',
      method: 'POST',
      body: { username: 'coach-timeout', password: 'pass-1' },
      user: null
    });
    assert.deepStrictEqual(response, {
      body: {
        token: 'token:coach-timeout',
        user: {
          id: 'coach-timeout',
          name: '超时回退教练',
          role: 'editor',
          status: 'active',
          coachId: '',
          coachName: '',
          matchPermissions: []
        }
      }
    });
  }

  {
    const { deps } = createDeps({
      getCachedRow: async () => new Promise((resolve, reject) => setTimeout(() => reject(new Error('ETIMEDOUT')), 20)),
      getCachedScan: async () => new Promise((resolve, reject) => setTimeout(() => reject(new Error('ETIMEDOUT')), 20))
    });
    const handler = createAuthAdminHandler(deps);
    const response = await handler({
      path: '/auth/login',
      method: 'POST',
      body: { username: 'coach-timeout', password: 'pass-1' },
      user: null
    });
    assert.deepStrictEqual(response, {
      status: 503,
      body: { error: '登录服务暂时超时，请重试' }
    });
  }

  const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
  assert.match(indexSource, /const \{ createAuthAdminHandler \} = require\('\.\/auth-admin\/route-handlers\.js'\);/, 'index should import auth admin route handler');
  assert.match(indexSource, /const handleAuthAdminRequest=createAuthAdminHandler\(/, 'index should build auth admin route handler via dependency injection');
  assert.match(indexSource, /const authAdminResponse=await handleAuthAdminRequest\(\{path,method,user,body,req\}\);/, 'index should forward auth and admin routes to the extracted handler');
  assert.doesNotMatch(indexSource, /if\(path==='\/auth\/login'&&method==='POST'\)\{/, 'login route should leave api/index.js');
  assert.doesNotMatch(indexSource, /if\(path==='\/admin\/create-user'&&method==='POST'\)\{/, 'admin create user route should leave api/index.js');

  console.log('auth admin handler tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
