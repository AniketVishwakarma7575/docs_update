function validateEchoBody(input) {
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  return message ? { message } : null;
}

async function handleDemoApi(request, response, pathname, helpers) {
  const { sendJson, readJson } = helpers;

  if (pathname === '/api/demo/status') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { success: false, error: 'Method not allowed' });
      return true;
    }

    sendJson(response, 200, {
      success: true,
      message: 'Demo API is running',
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    });
    return true;
  }

  if (pathname === '/api/demo/echo') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { success: false, error: 'Method not allowed' });
      return true;
    }

    const values = validateEchoBody(await readJson(request));
    if (!values) {
      sendJson(response, 400, { success: false, error: 'Message is required' });
      return true;
    }

    sendJson(response, 200, {
      success: true,
      message: 'Echo response',
      data: values,
    });
    return true;
  }

  return false;
}

module.exports = { handleDemoApi, validateEchoBody };
