import { registerProvider, type Provider } from "./provider.ts"

const SIM_MODEL = { id: "sim", name: "Simulator", contextLength: undefined, pricing: undefined }

export const simProvider: Provider = {
  id: "sim",
  name: "Simulator",
  chatEndpoint: "",
  listModels: async () => [SIM_MODEL],
  chat: async function* () {
    throw new Error("the sim provider does not serve chat completions; panes use simulatedSource directly")
  },
}

registerProvider(simProvider)
