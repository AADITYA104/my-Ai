---
name: 4-1-builtin-tools
description: "🔍 Built-in Tools"
category: design_frontend
---

# 🔍 Built-in Tools

Google ADK provides powerful **pre-built tools** that are optimized for performance and reliability. These tools integrate seamlessly with Gemini models and provide essential capabilities like web search and code execution.

## 🎯 What You'll Learn

- **Search Tool**: Web search capabilities for real-time information
- **Code Execution Tool**: Safe Python code execution environment
- **Tool Limitations**: Understanding when to use built-in vs custom tools
- **Best Practices**: Optimizing built-in tool usage

## 🧠 Core Concept: Built-in Tools

Built-in tools are **Google ADK's native capabilities** that provide:
- **High Performance**: Optimized for speed and reliability
- **Safety**: Built-in security and sandboxing
- **Gemini Integration**: Deep integration with Google's models
- **Maintenance-free**: No custom code to maintain

### Important Limitations
- ⚠️ **Gemini Models Only**: Built-in tools work only with Gemini models
- ⚠️ **Single Tool Type**: Cannot mix built-in and custom tools in same agent
- ⚠️ **Limited Customization**: Fixed functionality, cannot modify behavior

## 🔧 Available Built-in Tools

### 1. **Search Tool**
- **Purpose**: Web search for real-time information
- **Use Cases**: News, facts, current events, research
- **Benefits**: Fast, accurate, up-to-date results

### 2. **Code Execution Tool**
- **Purpose**: Execute Python code safely
- **Use Cases**: Calculations, data processing, algorithms
- **Benefits**: Secure sandbox environment

### 3. **RAG Tools** (Advanced)
- **Purpose**: Retrieval-augmented generation
- **Use Cases**: Document search, knowledge bases
- **Benefits**: Efficient information retrieval

## 🚀 Tutorial Examples

This sub-example includes two practical implementations:

### 📍 **Search Agent**
**Location**: `./search_agent/`
- Implements web search capabilities
- Handles real-time information queries
- Demonstrates search result processing

### 📍 **Code Execution Agent**
**Location**: `./code_exec_agent/`
- Executes Python code safely
- Performs mathematical calculations
- Processes data dynamically

## 📁 Project Structure

```
1_builtin_tools/
├── README.md                    # This file - built-in tools guide
├── search_agent/               # Web search implementation
│   ├── __init__.py            # Makes it a Python package
│   ├── agent.py               # Search agent with Search Tool
├── code_exec_agent/           # Code execution implementation
│   ├── __init__.py            # Makes it a Python package
│   ├── agent.py               # Code execution agent
└── requirements.txt           # Dependencies for built-in tools
└── .env.example              # Example API key configuration
```

## 🎯 Learning Objectives

By the end of this sub-example, you'll understand:
- ✅ How to use Google ADK's Search Tool effectively
- ✅ How to implement safe code execution with built-in tools
- ✅ When to choose built-in tools over custom solutions
- ✅ Limitations and best practices for built-in tools

## 🚀 Getting Started

1. **Set up your environment**:
   ```bash
   cd 4_1_builtin_tools
   
   # Copy the environment template
   cp env.example .env
   
   # Edit .env and add your Google AI API key
   # Get your API key from: https://aistudio.google.com/
   ```

2. **Install dependencies**:
   ```bash
   # Install required packages
   pip install -r requirements.txt
   ```
3. **Run the agents**:
   ```bash
   # Start the ADK web interface
   adk web
   
   # In the web interface, select either:
   # - search_agent: For trying web search capabilities
   # - code_exec_agent: For testing code execution features
   ```

## 💡 Pro Tips

- **Use for Real-time Data**: Perfect for current information needs
- **Leverage Gemini Integration**: Built-in tools are optimized for Gemini
- **Simple is Better**: Don't overcomplicate with custom tools if built-in works
- **Test Thoroughly**: Understand tool behavior before production use

## 🔧 Common Use Cases

### Search Tool Applications
- **News Updates**: Get latest news on topics
- **Fact Checking**: Verify information accuracy
- **Research**: Gather information on subjects
- **Market Data**: Current prices, trends

### Code Execution Applications
- **Mathematical Calculations**: Complex computations
- **Data Analysis**: Process and analyze data
- **Algorithm Implementation**: Test code logic
- **Visualization**: Generate charts and graphs

## 🚨 Important Notes

- **Model Dependency**: Only works with Gemini models
- **No Mixing**: Cannot combine with custom tools
- **Production Ready**: Built-in tools are enterprise-ready
- **Rate Limits**: Be aware of usage limits