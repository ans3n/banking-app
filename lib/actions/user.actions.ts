"use server"

import { ID, Query } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";
import { plaidClient } from "../plaid";
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

const {
    APPWRITE_DATABASE_ID: DATABASE_ID,
    APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
    APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

export const signIn = async ( {email, password}: signInProps) => {
    try {
        const { account } = await createAdminClient();

        const response = await account.createEmailPasswordSession(email, password);
        return parseStringify(response);

    } catch (error) {
        console.error('Error', error);
    }

}

export const signUp = async ({ password, ...userData}: SignUpParams) => {
    //destructuring syntax
    const {email, firstName, lastName} = userData;

    let newUserAccount;

    try {
        const { account, database } = await createAdminClient();

        newUserAccount = await account.create(
            ID.unique(),
            email,
            password,
            `${firstName} ${lastName}`
        );

        if (!newUserAccount) {
            throw new Error("Error creating user");
        }

        //if no error creating a user, create a dwolla customer url for payment processing
        const dwollaCustomerURL = await createDwollaCustomer({
            ...userData,
            type: 'personal'
        })

        if (!dwollaCustomerURL) {
            throw new Error("Error creating Dwolla customer");
        }

        //extract dwolla customer id from url
        const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerURL);

        const newUser = await database.createDocument(
            DATABASE_ID!,
            USER_COLLECTION_ID!,
            ID.unique(),
            {
                ...userData,
                userId: newUserAccount.$id,
                dwollaCustomerId,
                dwollaCustomerURL,
            }
        )

        const session = await account.createEmailPasswordSession(email, password);

        cookies().set("appwrite-session", session.secret, {
            path: "/",
            httpOnly: true,
            sameSite: "strict",
            secure: true,
        });

        return parseStringify(newUser); //nextjs cannot pass large objects(newuseraccount) through server actions - must stringify first
    } catch (error) {
        console.error('Error', error);
    }
}

export async function getLoggedInUser() {
    try {
        const { account } = await createSessionClient();
        const user = await account.get();

        return parseStringify(user);
    } catch (error) {
        return null;
    }
}

export const logoutAccount = async() => {
    try {
        const {account} = await createSessionClient();

        cookies().delete('appwrite-session');

        await account.deleteSession('current');
    } catch(error) {
        return null;
    }
}

export const createLinkToken = async (user: User) => {
    try {
        const tokenParams = {
            user: {
                client_user_id: user.$id
            },
            client_name: `${user.firstName} ${user.lastName}`,
            products: ['auth'] as Products[],
            language: 'en',
            country_codes: ['US'] as CountryCode[],
        }

        const response = await plaidClient.linkTokenCreate(tokenParams);

        return parseStringify({linkToken: response.data.link_token});
    } catch (error) {
        console.log(error);
    }
}

export const createBankAccount = async ({
    userId,
    bankId,
    accountId,
    accessToken,
    fundingSourceUrl,
    sharableId,
}: createBankAccountProps) => {
    try {
        const {database} = await createAdminClient();

        const bankAccount = await database.createDocument(
            DATABASE_ID!,
            BANK_COLLECTION_ID!,
            ID.unique(),
            {
                userId,
                bankId,
                accountId,
                accessToken,
                fundingSourceUrl,
                sharableId,
            }
        )
        return parseStringify(bankAccount);
    } catch (error) {
        
    }
}

export const exchangePublicToken = async ({
    publicToken,
    user,
}: exchangePublicTokenProps) => {
    try {
        //Exchange public token for access token and item ID
        const response = await plaidClient.itemPublicTokenExchange({
            public_token: publicToken,
        });

        //extract access token and item id from the response
        const accessToken = response.data.access_token;
        const itemId = response.data.item_id;

        //get account info from plaid with access token
        const accountsResponse = await plaidClient.accountsGet({
            access_token: accessToken,
        });

        const accountData = accountsResponse.data.accounts[0];

        //using account data and access token, create a processor token for dwolla(payment processor)
        const request: ProcessorTokenCreateRequest = {
            access_token: accessToken,
            account_id: accountData.account_id,
            processor: "dwolla" as ProcessorTokenCreateRequestProcessorEnum,
        };

        //using request token create processor token
        const processorTokenResponse = await plaidClient.processorTokenCreate(request);
        const processorToken = processorTokenResponse.data.processor_token;

        //fund account by creating a funding source URL for the account suing dwolla customer id, processor token, and bank name
        const fundingSourceUrl = await addFundingSource({
            dwollaCustomerId: user.dwollaCustomerId,
            processorToken,
            bankName: accountData.name,
        });

        //check funding source url is valid
        if (!fundingSourceUrl) {
            throw Error;
        }

        //creat e bank account with user id, item id, account id, access token, funding source url, and sharable id
        await createBankAccount({
            userId: user.$id,
            bankId: itemId,
            accountId: accountData.account_id,
            accessToken,
            fundingSourceUrl,
            sharableId: encryptId(accountData.account_id),
        });

        //revalidatae the path once we create a bank account
        revalidatePath("/");
        //return success message
        return parseStringify({
            publicTokenExchange: "complete",
        });

    } catch(error) {
        console.error("An error occurred while creating exchanging token:", error);
    }
}

export const getBanks = async ({userId}: getBanksProps) => {
    try {
        const {database} = await createAdminClient();

        //database query in appwrite
        const banks = await database.listDocuments(DATABASE_ID!, BANK_COLLECTION_ID!, [Query.equal('userId', [userId])])

        return parseStringify(banks.documents);
    } catch (error) {
        console.log(error);
    }
}

export const getBank = async ({documentId}: getBankProps) => {
    try {
        const {database} = await createAdminClient();

        //database query in appwrite
        const bank = await database.listDocuments(DATABASE_ID!, BANK_COLLECTION_ID!, [Query.equal('$id', [documentId])])

        return parseStringify(bank.documents[0]);
    } catch (error) {
        console.log(error);
    }
}
