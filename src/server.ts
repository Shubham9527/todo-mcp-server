import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { db, testDbConnection } from "./db";
import { todos } from "./db/schema";
import { eq, ilike } from "drizzle-orm";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import cors from "cors";

interface ITodo {
  id: string;
  title: string;
  isCompleted: boolean;
}

const server = new McpServer({
  name: "todo-mcp-server",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {},
  },
});

server.tool(
  "create-todo",
  "create todo in db",
  {
    title: z.string().min(1),
    isCompleted: z.boolean().default(false),
  },
  {
    title: "Create a todo item",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const createdTodo = await createTodo(params);
      return {
        content: [
          {
            type: "text",
            text: `Created new todo with title ${createdTodo.title} and id is ${createdTodo.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to save todo ${error}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "change-status-of-todo-using-title-of-todo",
  "change status of todo using title of todo",
  {
    title: z.string().min(1),
    isCompleted: z.boolean(),
  },
  {
    title: "Change status of todo using title of todo",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const updatedTodo = await changeStatus(params);

      if (!updatedTodo) {
        return {
          content: [
            {
              type: "text",
              text: `No todo found with id ${params.title}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Updated todo ${updatedTodo.title} to isCompleted: ${updatedTodo.isCompleted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to update todo ${error}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "delete-todo-using-title",
  "Delete todo using title of todo",
  {
    title: z.string().nonempty(),
  },
  async (params) => {
    try {
      const deletedTodoId = await deleteTodo({ title: params.title });

      return {
        content: [
          {
            type: "text",
            text: `Todo with title "${params.title}" is deleted successfully and id was ${deletedTodoId}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error while deleting todo: ${error}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "update-todo-using-title",
  "Update title of todo using existing title",
  { existingTitle: z.string().nonempty(), newTitle: z.string().nonempty() },
  async (params) => {
    try {
      const updatedTodo = await updateTodo(params);

      return {
        content: [
          {
            type: "text",
            text: `Title of todo ${params.existingTitle} has changed to ${updatedTodo.title}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error occured while updating todo: ${error}`,
          },
        ],
      };
    }
  }
);

server.tool("list-all-todos", "List all todo items", {}, async () => {
  try {
    const allTodos = await listTodos();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(allTodos),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `${error}`,
        },
      ],
    };
  }
});

const createTodo = async (params: Omit<ITodo, "id">) => {
  try {
    const todo = await db
      .insert(todos)
      .values({
        title: params.title,
        isCompleted: params.isCompleted,
      })
      .returning();

    return todo[0];
  } catch (error) {
    throw new Error(`something went wrong ${error}`);
  }
};

const updateTodo = async (params: {
  existingTitle: string;
  newTitle: string;
}) => {
  try {
    const updatedTodo = await db
      .update(todos)
      .set({
        title: params.newTitle,
      })
      .where(ilike(todos.title, `%${params.existingTitle}%`))
      .returning();

    return { title: updatedTodo[0].title };
  } catch (error) {
    throw new Error(`Error Updating todo: ${error}`);
  }
};

const deleteTodo = async (params: { title: string }) => {
  const findTodoUsingTitle = await db
    .select()
    .from(todos)
    .where(ilike(todos.title, `%${params.title}%`));

  if (findTodoUsingTitle.length > 0) {
    const deleteTodo = await db
      .delete(todos)
      .where(eq(todos.id, findTodoUsingTitle[0].id))
      .returning();

    return deleteTodo[0].id;
  }

  throw new Error(`No todo found with title similar to ${params.title}`);
};

const listTodos = async () => {
  try {
    const allTodos = await db.select().from(todos);
    return allTodos;
  } catch (error) {
    throw new Error("Something went wrong while fetching todos");
  }
};

const changeStatus = async (params: {
  title: string;
  isCompleted: boolean;
}) => {
  try {
    const findTodoWithRespectToName = await db
      .select()
      .from(todos)
      .where(ilike(todos.title, `%${params.title}%`));

    if (findTodoWithRespectToName.length > 0) {
      console.log("found todo", findTodoWithRespectToName[0]);

      const updatedTodo = await db
        .update(todos)
        .set({
          isCompleted: params.isCompleted,
        })
        .where(eq(todos.id, findTodoWithRespectToName[0].id))
        .returning();

      return updatedTodo[0];
    }

    throw new Error(`No todo found with title similar to ${params.title}`);
  } catch (error) {
    throw new Error(`something went wrong ${error}`);
  }
};

//TODO - STDIO transport - commented for reference
// const startServer = async () => {
//   await testDbConnection();

//   const stdioTransport = new StdioServerTransport();

//   await server.connect(stdioTransport);
// };

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
    // allowedHeaders: ["Content-Type", "mcp-session-id"],
    // allowedHeaders: [
    //   "Content-Type",
    //   "Accept",
    //   "Mcp-Session-Id",
    //   "mcp-session-id",
    // ],
    allowedHeaders: ["*"],
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  })
);

// Map to store transports by session ID
const transports: {
  [sessionId: string]: StreamableHTTPServerTransport;
} = {};

app.post("/mcp", async (req, res) => {
  await testDbConnection();
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New initialization request
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized(sessionId) {
        transports[sessionId] = transport;
      },
      // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
      // locally, make sure to set:
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
      enableDnsRebindingProtection: true,
      allowedHosts: [
        "127.0.0.1",
        "127.0.0.1:4000",
        "localhost",
        "localhost:4000",
      ],
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    await server.connect(transport);
  } else {
    res.json(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad request: No valid session ID provided",
      },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

const handleSessionRequest = async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or Missing session ID");
    return;
  }

  const transport = transports[sessionId];
  await transport.handleRequest(req, res);
};

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.listen(4000);
