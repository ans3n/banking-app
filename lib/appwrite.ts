"use server";
import { Client, Account, Databases, Users } from "node-appwrite";
import { cookies } from "next/headers";

//responsible for creating a session client and validates that this is the correct appwrite client
export async function createSessionClient() {
    //creates new appwrite client and sets its endpoint in project so that appwrite client so it knows which project to modify 
    const client = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!);

    const session = cookies().get("appwrite-session");

    //checks if session exists
    if (!session || !session.value) {
        throw new Error("No session");
    }

    //otherwise attach this session to this client
    client.setSession(session.value);

    //every time we want to get the session
    return {
        get account() {
            return new Account(client);
        },
    };
}

//has "admin" privileges with the key as we set the api key full permissions
export async function createAdminClient() {
    //set the endpoint project and key
    const client = new Client()
        .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
        .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
        .setKey(process.env.NEXT_APPWRITE_KEY!);

    return {
        get account() {
            return new Account(client);
        },
        get database() {
            return new Databases(client);
        },
        get user() {
            return new Users(client);
        }
    };
}
