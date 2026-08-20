---
name: 6-1-agent-lifecycle-callbacks
description: "6.1 Agent Lifecycle Callbacks"
category: general_tooling
---

# 6.1 Agent Lifecycle Callbacks

This tutorial demonstrates how to use `before_agent_callback` and `after_agent_callback` to monitor agent execution lifecycle.

## 🎯 Learning Objectives

- Understand agent lifecycle callbacks
- Learn how to monitor agent execution timing
- See how to share state between callbacks
- Practice implementing performance monitoring

## 📁 Project Structure

```
6_1_agent_lifecycle_callbacks/
├── agent.py          # Agent with lifecycle callbacks
├── app.py            # Streamlit web interface
├── requirements.txt  # Python dependencies
└── README.md         # This file
```

## 🔧 Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up API key:**
   ```bash
   # Create .env file
   echo "GOOGLE_API_KEY=your_api_key_here" > .env
   ```

## 🚀 Running the Demo

### Command Line Demo
```bash
python agent.py
```

### Web Interface
```bash
streamlit run app.py
```

## 🧠 Core Concept: Agent Lifecycle Monitoring

Agent lifecycle callbacks allow you to monitor the beginning and end of agent execution, providing visibility into when agents start and complete their tasks.

### **Agent Lifecycle Flow**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Input    │───▶│  Agent Start    │───▶│  Agent End      │
│                 │    │   Callback      │    │   Callback      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                       │
                              ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  Agent Logic    │    │  Performance    │
                       │  Execution      │    │  Metrics        │
                       └─────────────────┘    └─────────────────┘
```

### **Callback Execution Timeline**

```
Timeline: ──────────────────────────────────────────────────────────▶

User Message
    │
    ▼
┌─────────────────┐
│ before_agent    │ ← Records start time, agent info
│ _callback       │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Agent Logic     │ ← Core agent processing
│ Execution       │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ after_agent     │ ← Calculates duration, logs completion
│ _callback       │
└─────────────────┘
    │
    ▼
Response to User
```

## 📖 Code Walkthrough

### **1. Callback Functions**

The callbacks work in pairs to monitor the complete agent lifecycle:

**Before Callback (`before_agent_callback`):**
- Records execution start timestamp
- Stores start time in session state for after callback
- Logs agent execution start (agent name, time)
- Returns `None` to allow normal execution

**After Callback (`after_agent_callback`):**
- Retrieves start time from session state
- Calculates total execution duration
- Logs completion with performance metrics
- Returns `None` to use original result

### **2. State Management Between Callbacks**

```
Session State Flow:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ before_callback │───▶│  Session State  │───▶│ after_callback  │
│ stores:         │    │                 │    │ retrieves:      │
│ - start_time    │    │ - request_start │    │ - start_time    │
│                 │    │   _time         │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### **3. Agent Setup**

The agent is configured with both lifecycle callbacks:
- `before_agent_callback`: Monitors agent execution start
- `after_agent_callback`: Monitors agent execution completion
- Uses `InMemoryRunner` for proper callback triggering

## 🧪 Testing Examples

### **Example Output Format**

```
🚀 Agent LifecycleDemoAgent started at 19:15:30
⏰ Start time: 2024-01-15 19:15:30

✅ Agent LifecycleDemoAgent completed
⏱️ Duration: 1.23s
⏰ End time: 2024-01-15 19:15:31
📊 Performance: 1.23s | LifecycleDemoAgent

```

### **What Each Metric Tells You**

- **🚀 Start time**: When the agent began processing
- **✅ Completion time**: When the agent finished processing
- **⏱️ Duration**: Total execution time in seconds
- **📊 Performance**: Formatted performance summary

## 🔍 Key Concepts

### **Agent Lifecycle Monitoring**
- **Execution Start**: Track when agents begin processing
- **Execution End**: Track when agents complete their tasks
- **Performance Timing**: Calculate total execution duration
- **State Sharing**: Pass timing data between callbacks

### **CallbackContext**
- **agent_name**: Name of the agent being executed
- **invocation_id**: Unique identifier for this execution
- **state**: Session state that persists between callbacks

### **State Management**
- Use `callback_context.state.to_dict()` to get current state
- Use `callback_context.state.update()` to modify state
- State is shared between before and after callbacks

## 🎯 Use Cases

- **Performance Monitoring**: Track execution times
- **Logging**: Record agent activities
- **Analytics**: Collect usage statistics
- **Debugging**: Monitor agent behavior
- **Custom Logic**: Add pre/post processing

## 🚨 Common Mistakes

1. **Forgetting to await session creation:**
   ```python
   # ❌ Wrong
   session_service.create_session(...)
   
   # ✅ Correct
   await session_service.create_session(...)
   ```

2. **Using wrong callback signature:**
   ```python
   # ❌ Wrong
   def after_agent_callback(context, result):
   
   # ✅ Correct
   def after_agent_callback(callback_context: CallbackContext):
   ```

3. **Not using InMemoryRunner:**
   ```python
   # ❌ Wrong - callbacks won't trigger
   agent.run(message)
   
   # ✅ Correct
   runner.run_async(...)
   ```

## ⚠️ Critical Implementation Note

**Event Loop Completion**: The `after_agent_callback` will not trigger if you break the event loop immediately upon receiving `is_final_response()`. 

**Correct Pattern**: Allow the event loop to complete naturally:
```python
# ❌ Wrong - breaks loop early, after_agent_callback won't run
if event.is_final_response() and event.content:
    response_text = event.content.parts[0].text.strip()
    break  # This prevents after_agent_callback from running

# ✅ Correct - let loop complete naturally
if event.is_final_response() and event.content:
    response_text = event.content.parts[0].text.strip()
    # Don't break - let the loop complete to ensure callbacks run
```

This is a known ADK behavior where breaking the loop early prevents cleanup callbacks from executing.

## 🔗 Next Steps

- Try Tutorial 6.2: LLM Interaction Callbacks
- Experiment with state management between callbacks
- Add custom logging or analytics
- Implement performance alerts for slow responses 