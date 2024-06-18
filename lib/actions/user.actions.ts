"user server"

import { createSessionClient } from "../appwrite";

export const signIn = async () => {
    try {
        //mutation or database or fetch
    } catch(error) {
        console.error('Error', error);
    }
}

export const signUp = async (userData: SignUpParams) => {
    try {
        // create a user account
    } catch(error) {
        console.error('Error', error);
    }
}

export async function getLoggedInUser() {
    try {
      const { account } = await createSessionClient();
      return await account.get();
    } catch (error) {
      return null;
    }
  }
  