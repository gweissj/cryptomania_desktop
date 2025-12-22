const BASE_URL = "http://87.103.203.138:26608";

const getHeaders = () => {
  const token = localStorage.getItem("access_token");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const handleResponse = async (response) => {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    const msg =
      data?.detail ||
      data?.message ||
      response.statusText ||
      "Unexpected API error";
    throw new Error(msg);
  }
  return data;
};

export const api = {
  register: async ({ email, password, first_name, last_name, birth_date }) => {
    const response = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        first_name,
        last_name,
        birth_date,
      }),
    });
    return handleResponse(response);
  },

  login: async (email, password) => {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse(response);
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
    }
    return data;
  },

  logout: async () => {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: "POST",
        headers: getHeaders(),
      });
    } catch {
    } finally {
      localStorage.removeItem("access_token");
    }
  },

  getDashboard: async () => {
    const response = await fetch(`${BASE_URL}/crypto/dashboard`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getMarketMovers: async (limit = 6) => {
    const response = await fetch(
      `${BASE_URL}/crypto/market-movers?limit=${limit}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  getAssets: async ({ search = "", limit = 30 } = {}) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (search) params.set("search", search);
    const response = await fetch(
      `${BASE_URL}/crypto/assets?${params.toString()}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  getQuotes: async (asset_id) => {
    const response = await fetch(`${BASE_URL}/crypto/quotes/${asset_id}`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  getPortfolio: async () => {
    const response = await fetch(`${BASE_URL}/crypto/portfolio`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  deposit: async (amount) => {
    const response = await fetch(`${BASE_URL}/crypto/deposit`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ amount: parseFloat(amount) }),
    });
    return handleResponse(response);
  },

  withdraw: async (amount) => {
    const response = await fetch(`${BASE_URL}/crypto/withdraw`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ amount: parseFloat(amount) }),
    });
    return handleResponse(response);
  },

  buyAsset: async ({ asset_id, amount_usd, source = "coincap" }) => {
    const response = await fetch(`${BASE_URL}/crypto/buy`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        asset_id,
        amount_usd: parseFloat(amount_usd),
        source,
      }),
    });
    return handleResponse(response);
  },

  getSellOverview: async () => {
    const response = await fetch(`${BASE_URL}/crypto/sell/overview`, {
      headers: getHeaders(),
    });
    return handleResponse(response);
  },

  previewSell: async ({ asset_id, quantity, amount_usd, source = "coincap" }) => {
    const body = { asset_id, source };
    if (quantity != null) body.quantity = parseFloat(quantity);
    if (amount_usd != null) body.amount_usd = parseFloat(amount_usd);
    const response = await fetch(`${BASE_URL}/crypto/sell/preview`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  executeSell: async ({ asset_id, quantity, amount_usd, source = "coincap" }) => {
    const body = { asset_id, source };
    if (quantity != null) body.quantity = parseFloat(quantity);
    if (amount_usd != null) body.amount_usd = parseFloat(amount_usd);
    const response = await fetch(`${BASE_URL}/crypto/sell`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  getHistory: async (asset_id, days = 1) => {
    const response = await fetch(
      `${BASE_URL}/crypto/history/${asset_id}?days=${days}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  pollDeviceCommands: async ({
    target_device = "desktop",
    target_device_id,
    limit = 10,
  } = {}) => {
    const params = new URLSearchParams();
    params.set("target_device", target_device);
    params.set("limit", String(limit));
    if (target_device_id) {
      params.set("target_device_id", target_device_id);
    }
    const response = await fetch(
      `${BASE_URL}/crypto/device-commands/poll?${params.toString()}`,
      { headers: getHeaders() }
    );
    return handleResponse(response);
  },

  acknowledgeDeviceCommand: async (command_id, status) => {
    const response = await fetch(
      `${BASE_URL}/crypto/device-commands/${command_id}/ack`,
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      }
    );
    return handleResponse(response);
  },
};
