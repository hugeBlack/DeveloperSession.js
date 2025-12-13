import { AppleAccount } from "./AppleAccount";
import { v4 } from "uuid";

const developerServiceHost = import.meta.env.VITE_DEVELOPER_SERVICE_HOST;
const xcodeHeaders = { "X-Xcode-Version": "11.2 (11B41)" };

class DeveloperTeam {
    /** @type {string} */
    name;
    /** @type {string} */
    teamId;
}

class DeveloperDeviceType {
    /**
     * @param {string} segment
     */
    constructor(segment) {
        this.segment = segment;
    }

    /**
     * @returns {string}
     */
    urlSegment() {
        return this.segment;
    }

    static Any = new DeveloperDeviceType("");
    static Ios = new DeveloperDeviceType("ios/");
    static Tvos = new DeveloperDeviceType("tvos/");
    static Watchos = new DeveloperDeviceType("watchos/");
}

class DeveloperDevice {
    /** @type {string} */
    deviceId;
    /** @type {string} */
    name;
    /** @type {string} */
    deviceNumber;
}

class DevelopmentCertificate {
    /** @type {string} */
    name;
    /** @type {string} */
    certificateId;
    /** @type {string} */
    serialNumber;
    /** @type {string} */
    machineName;
    /** @type {string} */
    machineId;
    /** @type {Buffer} */
    certContent;
}

class AppId {
    /** @type {string} */
    appIdId;
    /** @type {string} */
    identifier;
    /** @type {string} */
    name;
    /** @type {Record<string, any>} */
    features;
    /** @type {Date | undefined} */
    expirationDate;
}

class ListAppIdsResponse {
    /** @type {Array<AppId>} */
    appIds;
    /** @type {number | undefined} */
    maxQuantity;
    /** @type {number | undefined} */
    availableQuantity;
}

class ApplicationGroup {
    /** @type {string} */
    applicationGroup;
    /** @type {string} */
    name;
    /** @type {string} */
    identifier;
}

class ProvisioningProfile {
    /** @type {string} */
    provisioningProfileId;
    /** @type {string} */
    name;
    /** @type {Buffer} */
    encodedProfile;
}

class V1GetBundleCapabilitiesResponse {
    dict;

    constructor(dict) {
        this.dict = dict
    }

    /**
     * 
     * @returns {string}
     */
    getAppIdId() {
        return this.dict.data?.id
    }

    /**
     * @returns {string[]}
     */
    getEnabledCapabilities() {
        if(!("included" in this.dict)) {
            return [];
        }
        let ans = []
        for(let capability of this.dict.included) {
            if(capability['type'] !== 'capabilities') {
                continue
            }
            ans.push(capability['id'])
        }
        return ans;
    }

    /**
     * @returns {string[]}
     */
    getAppGroups() {
        if(!("included" in this.dict)) {
            return [];
        }

        for(let capability of this.dict.included) {
            if(capability['type'] !== 'capabilities' || capability['id'] !== "APP_GROUPS") {
                continue
            }
            let entitlements = capability.attributes?.entitlements
            if(entitlements === undefined || !Array.isArray(entitlements) || entitlements.length === 0) {
                return [];
            }
            let entitlement = entitlements[0]
            if(entitlement.key != "APPLICATION_GROUPS_ENTITLEMENT") {
                return [];
            }
            if(!Array.isArray(entitlement.values) || entitlement.values.length === 0) {
                return [];
            }
            return entitlement.values.map(ag => ag.value);
        }
    }

}

class V1Capability {
    /**
     * @type {string}
     */
    id;
    constructor(id) {
        this.id = id
    }

    static increasedMemoryLimit = new V1Capability('INCREASED_MEMORY_LIMIT')
    static healthKit = new V1Capability('HEALTHKIT')
    static appGroups = new V1Capability("APP_GROUPS")
    static homeKit = new V1Capability("HOMEKIT")
    static gameCenter = new V1Capability("GAME_CENTR")
    static autofillCredentialProvider = new V1Capability("AUTOFILL_CREDENTIAL_PROVIDER")
    static wirelessAccessoryConfiguration = new V1Capability("WIRELESS_ACCESSORY_CONFIGURATION")
}

/**
 * @param {DeveloperDeviceType | string | undefined} deviceType
 * @param {string} endpoint
 * @returns {string}
 */
function devUrl(deviceType, endpoint) {
    let segment = "";
    if (deviceType instanceof DeveloperDeviceType) {
        segment = deviceType.urlSegment();
    } else if (typeof deviceType === "string") {
        const lower = deviceType.toLowerCase();
        if (lower === "ios") {
            segment = "ios/";
        } else if (lower === "tvos") {
            segment = "tvos/";
        } else if (lower === "watchos") {
            segment = "watchos/";
        }
    }
    return `${developerServiceHost}/services/QH65B2/${segment}${endpoint}.action?clientId=XABBG36SBA`;
}

class DeveloperSession {
    /** @type {AppleAccount} */
    account;
    /** @type {DeveloperTeam[] | undefined} */
    teams;

    /**
     * @param {AppleAccount} account
     */
    constructor(account) {
        this.account = account;
        this.team = undefined;
    }

    /**
     * Send a developer portal request.
     * @param {string} url
     * @param {Object | undefined} body
     * @returns {Promise<Record<string, any>>}
     */
    async sendDeveloperRequest(url, body) {
        const request = {
            clientId: "XABBG36SBA",
            protocolVersion: "QH65B2",
            requestId: v4().toUpperCase(),
            userLocale: ["en_US"],
            ...body
        };

        const response = await this.account.sendRequest(
            url,
            request,
            xcodeHeaders,
            undefined,
            true,
            "com.apple.gs.xcode.auth"
        );

        const resultCodeRaw = response?.resultCode ?? 0;
        const resultCode = typeof resultCodeRaw === "number" ? resultCodeRaw : Number(resultCodeRaw);
        if (!Number.isNaN(resultCode) && resultCode !== 0) {
            const description = response?.userString || response?.resultString || "(null)";
            throw new Error(`Developer request failed (${resultCode}): ${description}`);
        }

        return response;
    }

    /**
     * Send a developer portal request.
     * @param {string} url
     * @param {Object | undefined} body
     * @param {"get"|"patch"|"delete"} method
     * @returns {Promise<Record<string, any>>}
     */
    async sendV1DeveloperRequest(url, body, method) {
        let extraHeaders = Object.assign({}, xcodeHeaders)
        if ('urlEncodedQueryParams' in body) {
            extraHeaders['X-HTTP-Method-Override'] = 'GET'
        }

        const response = await this.account.sendRequest(
            url,
            body,
            extraHeaders,
            method,
            false,
            "com.apple.gs.xcode.auth"
        );

        if(response.data) {
            return response;
        } else if (response.errors) {
            let errStr = response.errors.map(err => {
                return `[${err.title}: ${err.detail} (${err.code})]`
            }).join(" ")
            throw new Error(`Developer request failed ${errStr}`);
        } else {
            throw new Error(`Developer request failed with unknown error.`);
        }

    }

    /**
     * List available developer teams.
     * @returns {Promise<Array<DeveloperTeam>>}
     */
    async listTeams() {
        if(this.teams) {
            return this.teams
        }
        const url = `${developerServiceHost}/services/QH65B2/listTeams.action?clientId=XABBG36SBA`;
        const response = await this.sendDeveloperRequest(url, undefined);
        const teams = response?.teams;
        if (!teams) {
            throw new Error("listTeams response does not contain teams");
        }
        const ans = teams.map(teamDict => {
            const team = new DeveloperTeam();
            team.name = teamDict?.name;
            team.teamId = teamDict?.teamId;
            return team;
        });
        this.teams = ans;
        return ans;
    }

    /**
     * Fetch the cached team or resolve the first available team.
     * @returns {Promise<DeveloperTeam>}
     */
    async getTeam() {
        if (this.teams) {
            return this.teams[0];
        }
        const teams = await this.listTeams();
        if (!teams.length) {
            throw new Error("No developer teams found");
        }
        // TODO: Expose selection of multiple teams.
        return teams[0];
    }

    /**
     * Set the current team.
     * @param {DeveloperTeam} team
     */
    setTeam(team) {
        this.team = team;
    }

    /**
     * List devices registered for the team.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @returns {Promise<Array<DeveloperDevice>>}
     */
    async listDevices(deviceType, team) {
        const url = devUrl(deviceType, "listDevices");
        const body = { teamId: team.teamId };
        const response = await this.sendDeveloperRequest(url, body);
        const devices = response?.devices;
        if (!devices) {
            throw new Error("listDevices response does not contain devices");
        }
        return devices.map(deviceDict => {
            const device = new DeveloperDevice();
            device.deviceId = deviceDict?.deviceId;
            device.name = deviceDict?.name;
            device.deviceNumber = deviceDict?.deviceNumber;
            return device;
        });
    }

    /**
     * Register a device with the developer account.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {string} deviceName
     * @param {string} udid
     * @returns {Promise<DeveloperDevice>}
     */
    async addDevice(deviceType, team, deviceName, udid) {
        const url = devUrl(deviceType, "addDevice");
        const body = {
            teamId: team.teamId,
            name: deviceName,
            deviceNumber: udid
        };
        const response = await this.sendDeveloperRequest(url, body);
        const deviceDict = response?.device;
        if (!deviceDict) {
            throw new Error("addDevice response does not contain device");
        }
        const device = new DeveloperDevice();
        device.deviceId = deviceDict?.deviceId;
        device.name = deviceDict?.name;
        device.deviceNumber = deviceDict?.deviceNumber;
        return device;
    }

    /**
     * List all development certificates.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @returns {Promise<Array<DevelopmentCertificate>>}
     */
    async listAllDevelopmentCerts(deviceType, team) {
        const url = devUrl(deviceType, "listAllDevelopmentCerts");
        const body = { teamId: team.teamId };
        const response = await this.sendDeveloperRequest(url, body);
        const certificates = response?.certificates;
        if (!certificates) {
            throw new Error("listAllDevelopmentCerts response does not contain certificates");
        }
        return certificates.map(certDict => {
            const cert = new DevelopmentCertificate();
            cert.name = certDict?.name;
            cert.certificateId = certDict?.certificateId;
            cert.serialNumber = certDict?.serialNumber;
            cert.machineName = certDict?.machineName || "";
            cert.machineId = certDict?.machineId;
            cert.certContent = certDict?.certContent;
            return cert;
        });
    }

    /**
     * Revoke a development certificate.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {string} serialNumber
     * @returns {Promise<void>}
     */
    async revokeDevelopmentCert(deviceType, team, serialNumber) {
        const url = devUrl(deviceType, "revokeDevelopmentCert");
        const body = { teamId: team.teamId, serialNumber };
        await this.sendDeveloperRequest(url, body);
    }

    /**
     * Submit a CSR for a new development certificate.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {string} csrContent
     * @param {string} machineName
     * @returns {Promise<string>}
     */
    async submitDevelopmentCsr(deviceType, team, csrContent, machineName) {
        const url = devUrl(deviceType, "submitDevelopmentCSR");
        const body = {
            teamId: team.teamId,
            csrContent,
            machineId: v4().toUpperCase(),
            machineName
        };
        const response = await this.sendDeveloperRequest(url, body);
        const certRequest = response?.certRequest;
        if (!certRequest) {
            throw new Error("submitDevelopmentCsr response does not contain certRequest");
        }
        return certRequest.certRequestId;
    }

    /**
     * List application identifiers.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @returns {Promise<ListAppIdsResponse>}
     */
    async listAppIds(deviceType, team) {
        const url = devUrl(deviceType, "listAppIds");
        const body = { teamId: team.teamId };
        const response = await this.sendDeveloperRequest(url, body);
        const appIds = response?.appIds;
        if (!appIds) {
            throw new Error("listAppIds response does not contain appIds");
        }

        const result = new ListAppIdsResponse();
        result.appIds = appIds.map(appIdDict => {
            const appId = new AppId();
            appId.name = appIdDict?.name;
            appId.appIdId = appIdDict?.appIdId;
            appId.identifier = appIdDict?.identifier;
            appId.features = appIdDict?.features || {};
            appId.expirationDate = appIdDict?.expirationDate;
            return appId;
        });

        result.maxQuantity = response?.maxQuantity;
        result.availableQuantity = response?.availableQuantity;
        return result;
    }

    /**
     * Create a new application identifier.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {string} name
     * @param {string} identifier
     * @returns {Promise<void>}
     */
    async addAppId(deviceType, team, name, identifier) {
        const url = devUrl(deviceType, "addAppId");
        const body = { teamId: team.teamId, name, identifier };
        await this.sendDeveloperRequest(url, body);
    }

    /**
     * Update application identifier capabilities.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {AppId} appId
     * @param {Record<string, any>} features
     * @returns {Promise<Record<string, any>>}
     */
    async updateAppId(deviceType, team, appId, features) {
        const url = devUrl(deviceType, "updateAppId");
        const body = { appIdId: appId.appIdId, teamId: team.teamId, ...features };
        const response = await this.sendDeveloperRequest(url, body);
        const appIdDict = response?.appId;
        if (!appIdDict || !appIdDict.features) {
            throw new Error("updateAppId response does not contain appId.features");
        }
        return appIdDict.features;
    }

    /**
     * Delete an application identifier.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {string} appIdId
     * @returns {Promise<void>}
     */
    async deleteAppId(deviceType, team, appIdId) {
        const url = devUrl(deviceType, "deleteAppId");
        const body = { teamId: team.teamId, appIdId };
        await this.sendDeveloperRequest(url, body);
    }

    /**
     * List application groups.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @returns {Promise<Array<ApplicationGroup>>}
     */
    async listApplicationGroups(deviceType, team) {
        const url = devUrl(deviceType, "listApplicationGroups");
        const body = { teamId: team.teamId };
        const response = await this.sendDeveloperRequest(url, body);
        const appGroupList = response?.applicationGroupList;
        if (!appGroupList) {
            throw new Error("listApplicationGroups response does not contain applicationGroupList");
        }
        return appGroupList.map(appGroupDict => {
            const group = new ApplicationGroup();
            group.applicationGroup = appGroupDict?.applicationGroup;
            group.name = appGroupDict?.name;
            group.identifier = appGroupDict?.identifier;
            return group;
        });
    }

    /**
     * Delete an application group.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {ApplicationGroup} appGroup
     * @returns {Promise<void>}
     */
    async deleteApplicationGroups(deviceType, team, appGroup) {
        const url = devUrl(deviceType, "deleteApplicationGroup");
        const body = { teamId: team.teamId, applicationGroup: appGroup.applicationGroup };
        const response = await this.sendDeveloperRequest(url, body);
        return;
    }

    /**
     * Create a new application group.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {string} groupIdentifier
     * @param {string} name
     * @returns {Promise<ApplicationGroup>}
     */
    async addApplicationGroup(deviceType, team, groupIdentifier, name) {
        const url = devUrl(deviceType, "addApplicationGroup");
        const body = { teamId: team.teamId, name, identifier: groupIdentifier };
        const response = await this.sendDeveloperRequest(url, body);
        const appGroupDict = response?.applicationGroup;
        if (!appGroupDict) {
            throw new Error("addApplicationGroup response does not contain applicationGroup");
        }
        const group = new ApplicationGroup();
        group.applicationGroup = appGroupDict?.applicationGroup;
        group.name = appGroupDict?.name;
        group.identifier = appGroupDict?.identifier;
        return group;
    }

    /**
     * Assign an application group to an app id.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {AppId} appId
     * @param {string[]} appGroupIds
     * @returns {Promise<void>}
     */
    async assignApplicationGroupToAppId(deviceType, team, appId, appGroupIds) {
        const url = devUrl(deviceType, "assignApplicationGroupToAppId");
        const body = {
            teamId: team.teamId,
            appIdId: appId.appIdId,
            applicationGroups: appGroupIds
        };
        await this.sendDeveloperRequest(url, body);
    }

    /**
     * Download the provisioning profile for a team app id.
     * @param {DeveloperDeviceType | string} deviceType
     * @param {DeveloperTeam} team
     * @param {AppId} appId
     * @returns {Promise<ProvisioningProfile>}
     */
    async downloadTeamProvisioningProfile(deviceType, team, appId) {
        const url = devUrl(deviceType, "downloadTeamProvisioningProfile");
        const body = { teamId: team.teamId, appIdId: appId.appIdId };
        const response = await this.sendDeveloperRequest(url, body);
        const profileDict = response?.provisioningProfile;
        if (!profileDict) {
            throw new Error("downloadTeamProvisioningProfile response does not contain provisioningProfile");
        }
        const profile = new ProvisioningProfile();
        profile.name = profileDict?.name;
        profile.provisioningProfileId = profileDict?.provisioningProfileId;
        profile.encodedProfile = profileDict?.encodedProfile;
        return profile;
    }

    /**
     * 
     * @param {DeveloperTeam} team 
     * @param {AppId} appId 
     */
    async listAppIdsV1(team, appId) {
        let url = developerServiceHost + "/services/v1/bundleIds"
        let data = {
            "attributes":{
                "teamId": team.teamId,
                "identifier": appId.identifier,
                "name": appId.name
            },
            "type": "bundleIds"
        }

        return await this.sendV1DeveloperRequest(url, data, "post")
    }

    /**
     * 
     * @param {DeveloperTeam} team 
     * @param {AppId} appId 
     * @returns {Promise<V1GetBundleCapabilitiesResponse>}
     */
    async v1GetBundleCapabilities(team, appId) {
        let url = developerServiceHost + `/services/v1/bundleIds/${appId.appIdId}`
        let data = {"urlEncodedQueryParams":`teamId=${team.teamId}&include=bundleIdCapabilities.capability,bundleIdCapabilities.appGroups,bundleIdCapabilities.cloudContainers,bundleIdCapabilities.merchantIds,bundleIdCapabilities.associatedBundleIds`}
        return new V1GetBundleCapabilitiesResponse(await this.sendV1DeveloperRequest(url, data, "post"))
    }

    /**
     * 
     * @param {DeveloperTeam} team 
     * @param {AppId} appId 
     * @param {V1Capability} capability 
     * @param {boolean} enabled 
     */
    async v1SetBundleBoolCapability(team, appId, capability, enabled) {
        let url = developerServiceHost + `/services/v1/bundleIds/${appId.appIdId}`
        let data = {"data":{"type":"bundleIds","id":appId.appIdId,"attributes":{"name":appId.name,"hasExclusiveManagedCapabilities":false,"bundleType":"bundle","teamId":team.teamId,"identifier":appId.identifier,"seedId":team.teamId},"relationships":{"bundleIdCapabilities":{"data":[{"attributes":{"enabled":enabled,"settings":[]},"relationships":{"capability":{"data":{"type":"capabilities","id":capability.id}}},"type":"bundleIdCapabilities"}]}}}}

        return await this.sendV1DeveloperRequest(url, data, "patch")
    }
}


export {
    DeveloperSession,
    DeveloperTeam,
    DeveloperDeviceType,
    DeveloperDevice,
    DevelopmentCertificate,
    AppId,
    ListAppIdsResponse,
    ApplicationGroup,
    ProvisioningProfile,
    V1GetBundleCapabilitiesResponse
}
