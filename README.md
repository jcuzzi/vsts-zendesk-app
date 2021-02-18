# Azure DevOps App for Zendesk

Forked from [Microsoft official's repository](https://github.com/microsoft/vsts-zendesk-app).

> Get the [latest version](https://github.com/jcuzzi/vsts-zendesk-app/releases) of the app

Unite your customer support and development teams. Quickly create or link work items to tickets, enable efficient two-way communication, and stop using email to check status.

## Create work items for your engineers right from Zendesk

With the Azure DevOps app for Zendesk, users in Zendesk can quickly create a new work item from a Zendesk ticket.


## Get instant access to the status of linked work items

Give your customer support team easy access to the information they need. See details about work items linked to a Zendesk ticket.

## How to install and setup

### Install the app to Zendesk

1. [Download the latest release](https://github.com/jcuzzi/vsts-zendesk-app/releases) .zip file
2. From Zendesk, click the settings icon (gear)
3. Under **Apps** click Manage.
4. Click **Upload private app**
5. Give the app a name.
6. Browse to the location you saved the .zip release and select it.
7. Provide your Azure DevOps name and decide on a work item tag for Zendesk.

#### Using Custom Fields

Only a dropdown type from a picklist is supported right now. Use the custom_fields setting.

Object Attributes:

type: Only "list" is available right now
label: Will set the text for the label on the "new work item form"
name: The Azure field name
class: A unique class name for the control
value: A lookup value for the Azure API - list ID for lists

Ex:

[
    {
        "type": "list",
        "label": "Product Module",
        "name": "EnowSoftware.ProductModule",
        "class": "productModule",
        "value": "780288cc-575f-4809-9e4b-70c4b1ab4bf3"
    },
    {
        "type": "list",
        "label": "Product Name",
        "name": "EnowSoftware.ProductName",
        "class": "productName",
        "value": "10369a78-3400-4acf-ae16-2680d6a9a275"
    },
    {
        "type": "list",
        "label": "Product Version",
        "name": "Custom.CustomerProductVersion",
        "class": "productVersion",
        "value": "c5bdc319-312e-4855-8270-5253ddf4abcb"
    }
]

See [full instructions](https://www.visualstudio.com/docs/marketplace/integrate/service-hooks/services/zendesk)

### Send updates from Azure DevOps to Zendesk

1. Open the admin page for the team project in Azure DevOps
2. On the *Service Hooks* tab, run the subscription wizard
3. Select Zendesk from the subscription wizard
4. Pick and the Azure DevOps event which will post to Zendesk
5. Tell Zendesk what to do when the event occurs
6. Test the service hook subscription and finish the wizard

## Development

apt-get install nodejs npm ruby-full
gem install rake zendesk_apps_tools
npm install
npm run build
zat server --path=./dist
