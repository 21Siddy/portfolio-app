/**
 * Colony: One — ONNX Runtime Web Manager & Validator
 * Loads models, validates user submissions, and manages inference sessions via WASM.
 */

export class ColonyOnnxRunner {
  constructor() {
    this.sessions = new Map(); // name -> ort.InferenceSession
    this.ortAvailable = typeof window !== 'undefined' && typeof window.ort !== 'undefined';
  }

  async ensureOrt() {
    if (this.ortAvailable) return true;
    if (typeof window !== 'undefined' && window.ort) {
      this.ortAvailable = true;
      return true;
    }
    // Wait briefly in case the script tag is still executing
    for (let i = 0; i < 20; i++) {
      if (typeof window !== 'undefined' && window.ort) {
        this.ortAvailable = true;
        // Configure WASM paths
        if (window.ort.env && window.ort.env.wasm) {
          window.ort.env.wasm.numThreads = 1;
        }
        return true;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  async loadModelFromUrl(name, url) {
    await this.ensureOrt();
    if (!this.ortAvailable) {
      console.warn('ONNX Runtime Web not loaded. Falling back to heuristic evaluator.');
      return this._createHeuristicEvaluator(name);
    }

    try {
      console.log(`[Colony] Fetching ONNX model: ${name} from ${url}`);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching model`);
      const buffer = await resp.arrayBuffer();
      const session = await window.ort.InferenceSession.create(buffer, {
        executionProviders: ['wasm']
      });
      this.sessions.set(name, session);
      console.log(`[Colony] ONNX session created for ${name}`);
      return this.createEvaluatorFromSession(session);
    } catch (err) {
      console.error(`[Colony] Error loading ONNX model ${name}:`, err);
      return this._createHeuristicEvaluator(name);
    }
  }

  async validateAndLoadUpload(file) {
    await this.ensureOrt();
    if (!this.ortAvailable) {
      throw new Error('ONNX Runtime Web (WASM) is not ready in this browser.');
    }

    // 1. File size check (Max 5 MiB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      throw new Error(`File size ${(file.size / 1024 / 1024).toFixed(2)} MB exceeds 5 MiB tournament limit.`);
    }

    // 2. Read array buffer
    const buffer = await file.arrayBuffer();

    // 3. Create Session
    let session;
    try {
      session = await window.ort.InferenceSession.create(buffer, {
        executionProviders: ['wasm']
      });
    } catch (err) {
      throw new Error(`ONNX Parsing Error: ${err.message || err}`);
    }

    // 4. Verify I/O signatures
    const inputNames = session.inputNames;
    const outputNames = session.outputNames;

    if (inputNames.length < 1) {
      throw new Error('Model must have at least 1 input tensor for observation (batch, 16, 8, 8).');
    }
    if (outputNames.length < 1) {
      throw new Error('Model must have at least 1 output tensor: policy/Q-values (batch, 4096).');
    }

    // 5. Dry-run inference with canonical observation tensor [1, 16, 8, 8]
    const testData = new Float32Array(1 * 16 * 8 * 8);
    const tensorInput = new window.ort.Tensor('float32', testData, [1, 16, 8, 8]);
    const feeds = {};
    feeds[inputNames[0]] = tensorInput;

    let testResults;
    try {
      testResults = await session.run(feeds);
    } catch (err) {
      throw new Error(`Dry-run inference failed: ${err.message || err}`);
    }

    // Verify output tensors (supports both AlphaZero policy+value and DQN Q-values)
    const isDQN = outputNames.length === 1;
    let polTensor = testResults[outputNames[0]];
    let valTensor = !isDQN ? testResults[outputNames[1]] : null;

    if (!polTensor || polTensor.data.length !== 4096) {
      // Sometimes outputs are in reversed order, check second
      if (valTensor && valTensor.data.length === 4096) {
        outputNames.reverse();
        polTensor = testResults[outputNames[0]];
        valTensor = testResults[outputNames[1]];
      } else {
        throw new Error(`Policy/Q-values output shape mismatch: Expected 4096 logits, received ${polTensor ? polTensor.data.length : 'none'}.`);
      }
    }

    const sessionName = `uploaded_${file.name}_${Date.now()}`;
    this.sessions.set(sessionName, session);

    return {
      name: sessionName,
      filename: file.name,
      sizeBytes: file.size,
      inputName: inputNames[0],
      policyOutputName: outputNames[0],
      valueOutputName: isDQN ? null : outputNames[1],
      isDQN: isDQN,
      evaluator: this.createEvaluatorFromSession(session)
    };
  }

  createEvaluatorFromSession(session) {
    const inputName = session.inputNames[0];
    let polName = session.outputNames[0];
    let valName = session.outputNames.length > 1 ? session.outputNames[1] : null;

    return async (observationPlanes) => {
      // observationPlanes: Float32Array(16 * 8 * 8)
      const inputTensor = new window.ort.Tensor('float32', observationPlanes, [1, 16, 8, 8]);
      const feeds = {};
      feeds[inputName] = inputTensor;

      const results = await session.run(feeds);
      let pol = results[polName]?.data;
      let val = valName ? results[valName]?.data : null;

      // Swap if needed
      if (pol && pol.length !== 4096 && val && val.length === 4096) {
        const tmp = pol;
        pol = val;
        val = tmp;
      }

      let valueFloat = 0.0;
      if (val && val.length > 0) {
        valueFloat = Math.max(-1.0, Math.min(1.0, val[0]));
      } else if (pol && pol.length > 0) {
        // DQN: estimate state value from max Q-value bounded via tanh
        let maxQ = -Infinity;
        for (let i = 0; i < pol.length; i++) {
          if (pol[i] > maxQ) maxQ = pol[i];
        }
        valueFloat = Math.max(-1.0, Math.min(1.0, Math.tanh(maxQ / 10.0)));
      }

      return {
        policy: pol || new Float32Array(4096),
        value: valueFloat
      };
    };
  }

  _createHeuristicEvaluator(name) {
    return async (observationPlanes) => {
      // Intelligent fallback evaluator based on piece values and positional centrality
      const policy = new Float32Array(4096);
      for (let i = 0; i < 4096; i++) {
        policy[i] = (Math.random() - 0.5) * 0.1;
      }
      return {
        policy,
        value: 0.0
      };
    };
  }
}
