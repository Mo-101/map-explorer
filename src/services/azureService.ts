
/**
 * Azure AI Service Handler
 * Synchronized with user-provided project credentials for 'afro-ai-resource'.
 */

const DEFAULTS = {
  ENDPOINT: 'https://afro-ai-resource.cognitiveservices.azure.com/',
  API_KEY: '4cq1bNSaWQeqJfWEBV4flKv4GGrR6ZWtOEQpclXm6XtATDh98KhWJQQJ99BLAC5RqLJXJ3w3AAAAACOG856V',
  DEPLOYMENT: 'afro-ai-4o', // Exact deployment name from user portal
  API_VERSION: '2024-12-01-preview' // Valid version for gpt-4o-mini on Azure
};

// Fallback pool updated to include common variants of the user's specific naming convention
const FALLBACK_DEPLOYMENTS = ['afro-ai-4o', 'gpt-4o-mini', 'afro-ai'];

export const fetchAzureAnalysis = async (prompt: string): Promise<string> => {
  const userEndpoint = localStorage.getItem('AZURE_ENDPOINT');
  const userKey = localStorage.getItem('AZURE_API_KEY');
  const userDeployment = localStorage.getItem('AZURE_DEPLOYMENT');
  const userApiVersion = localStorage.getItem('AZURE_API_VERSION');

  const endpointBase = userEndpoint || DEFAULTS.ENDPOINT;
  const apiKey = userKey || DEFAULTS.API_KEY;
  const primaryDeployment = userDeployment || DEFAULTS.DEPLOYMENT;
  const apiVersion = userApiVersion || DEFAULTS.API_VERSION;

  const deploymentsToTry = [primaryDeployment, ...FALLBACK_DEPLOYMENTS.filter(d => d !== primaryDeployment)];

  // Clean the base URL
  let cleanBase = endpointBase.trim();
  if (!cleanBase.startsWith('http')) cleanBase = `https://${cleanBase}`;
  if (cleanBase.endsWith('/')) cleanBase = cleanBase.slice(0, -1);

  let lastError = "";

  for (const deployment of deploymentsToTry) {
    // Exact URL pattern as per Azure OpenAI standards
    const fullUrl = `${cleanBase}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
    
    try {
      console.log(`[Azure Satellite] Establishing link via: ${deployment}`);
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          messages: [
            { 
              role: "system", 
              content: "You are an elite weather forensic analyst for Africa. Provide scientific validation for atmospheric models. Focus on the 'afro-ai-resource' satellite telemetry data." 
            },
            { role: "user", content: prompt }
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Persist the verified working deployment name
        if (deployment !== primaryDeployment) {
          localStorage.setItem('AZURE_DEPLOYMENT', deployment);
        }
        return data.choices[0].message.content;
      }

      const errorData = await response.json().catch(() => ({}));
      if (response.status === 404) {
        console.warn(`[Azure Satellite] Deployment '${deployment}' unreachable. Synchronizing next frequency...`);
        lastError = `Target deployment '${deployment}' was not found at the provided endpoint.`;
        continue;
      }
      
      throw new Error(errorData.error?.message || `Relay Error (Code ${response.status})`);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        lastError = error.message;
        continue;
      }
      console.error(`[Azure Satellite] Relay failure on ${deployment}:`, error);
      throw error;
    }
  }

  return `Azure Satellite Offline. Final check on '${primaryDeployment}' failed. Error: ${lastError} Please ensure the Deployment Name is set to 'afro-ai-4o' in Satellite Config.`;
};
