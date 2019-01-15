'use strict';

const validatorSetSize       = 30;
const kolSetSize             = 100;
const inPassRate             = 0.5;
const outPassRate            = 0.7;
const effectiveVoteInterval  = 15 * 24 * 60 * 60 * 1000 * 1000;
const validatorMinPledge     = 5000000 * 100000000;
const kolMinPledge           = 5 * 100000000;

const rewardKey              = 'block_reward';
const committeeKey           = 'committee';
const kolCandidatesKey       = 'kol_candidates';
const validatorCandidatesKey = 'validator_candidates';

const dpos = {};
const memberType = {
   'committee' : 1,
   'validator' : 2,
   'kol' : 3
};

function doubleSort(a, b){
    let com = int64Compare(b[1], a[1]) ;

    if(com === 0){
        return a[0] > b[0] ? 1 : -1;
    }

    return com;
}

function loadObj(key)
{
    let data = storageLoad(key);
    if(data !== false){
        return JSON.parse(data);
    }

    return false;
}

function delObj(key)
{
    storageDel(key);
    log('Delete (' + key + ') from metadata succeed.');
}

function saveObj(key, value)
{
    let str = JSON.stringify(value);
    storageStore(key, str);
    log('Set key(' + key + '), value(' + str + ') in metadata succeed.');
}

function transferCoin(dest, amount)
{
    if(amount === '0'){
        return true; 
    }

    payCoin(dest, amount);
    log('Pay coin( ' + amount + ') to dest account(' + dest + ') succeed.');
}

function createApplyKey(type, address){
    let key = '';
    if(type == memberType.committee){
        key = 'apply_committee_' + address; 
    }
    else if(type === member.validators){
        key = 'apply_validator_' + address; 
    }
    else{
        key = 'apply_KOL_' + address; 
    }

    return key;
}

function applyProposal(){
    let proposal = {
        'pledge':thisPayCoinAmount,
        'expiration':blockTimestamp + effectiveVoteInterval,
        'ballot':[]
    };

    return proposal;
}

function abolishProposal(proof){
    let proposal = {
        'Informer': sender,
        'reason': proof,
        'expiration': blockTimestamp + effectiveVoteInterval,
        'ballot': [sender]
    };

    return proposal;
}

function checkPledge(type){
    let com = -1;

    if(type === memberType.validators){
        com = int64Compare(thisPayCoinAmount, validatorMinPledge);
        assert(com === 0 || com === 1, 'Quality deposit is less than the minimum pledge of validator.');
    }
    else if(type === memberType.kol){
        com = int64Compare(thisPayCoinAmount, kolMinPledge);
        assert(com === 0 || com === 1, 'Quality deposit is less than the minimum pledge of KOL.');
    }
    else if(type === memberType.committee){
        assert(thisPayCoinAmount === '0', 'No deposit is required to apply to join the committee');
    }
}

function updateCandidates(type, address, pledge){
    let candidates = type === memberType.validator ? dpos.validatorCandidates : dpos.kolCandidates;
    let candidate = candidates.find(function(x){
        return x[0] === address;
    });

    if(candidate === undefined){
        candidates.push([address, pledge]);
    }
    else{
        candidate[1] = int64Add(candidate[1], thisPayCoinAmount);
    }

    candidates.sort(doubleSort);

    if(type === memberType.validator && candidates.indexOf(candidate) < validatorSetSize){
        let validators = candidates.slice(0, validatorSetSize);
        return setValidators(JSON.stringify(validators));
    }

    return true;
}

function apply(type){
    let key = createApplyKey(key, sender);
    let proposal = loadObj(key);

    if(proposal === false){
        checkPledge(type);
        proposal = applyProposal();
        return saveObj(key, proposal);
    }

    proposal.pledge = int64Add(proposal.pledge, thisPayCoinAmount);
    if(proposal.passTime === undefined){
        proposal.expiration = blockTimestamp + effectiveVoteInterval,
        saveObj(key, proposal);
        return true;
    }

    saveObj(key, proposal);
    updateCandidates(type, sender);
}

function approveIn(type, applicant){
    let committee = loadObj(committeeKey);
    assert(committee.includes(sender), 'Only committee members have the right to approve.');

    let key = createApplyKey(type, address);
    let proposal = loadObj(key);
    assert(proposal !== false, 'failed to get metadata: ' + key + '.');
        
    if(blockTimestamp >= proposal.expiration){
        transferCoin(applicant, proposal.pledge);
        return delObj(key);
    }

    assert(proposal.ballot.includes(sender) !== true, sender + ' has voted.');
    proposal.ballot.push(sender);
    if(proposal.ballot.length <= parseInt(committee.length * inPassRate + 0.5)){
        return saveObj(key, proposal);
    }

    if(type === memberType.committee){
        committee.push(applicant);
        return saveObj(key, committee);
    }
    else{
        return updateCandidates(type, applicant, proposal.pledge);
    }
}

function vote(type, address){
    let key = '';
    if(type === memberType.validators){
        key = 'voter_' + sender + '_validator_' + address;
    }
    else if(type === memberType.kol){
        key = 'voter_' + sender + '_kol_' + address;
    }
    else{
        throw 'Unkown voting type.';
    }

    let voteAmount = loadObj(key);
    if(voteAmount === false){
        voteAmount = thisPayCoinAmount;
    }
    else{
        voteAmount = int64Add(voteAmount, thisPayCoinAmount);
    }

    saveObj(key, thisPayCoinAmount);
    updateCandidates(type, address);
}

function abolish(type, address, proof){

}

function approveOut(type){

}

function withdraw(type){

}

function dposInit(){
    dpos = loadObj(rewardKey);
    assert(dpos !== false, 'Faild to get all stake and reward distribution table.');

    dpos.balance = getBalance();
    assert(dpos.balance !== false, 'Faild to get account balance.');

    dpos.validatorCandidates = loadObj(validatorCandidatesKey);
    assert(dpos.validatorCandidates !== false, 'Faild to get validator candidates.');

    dpos.kolCandidates = loadObj(kolCandidatesKey);
    assert(dpos.kolCandidates !== false, 'Faild to get kol candidates.');
}

function distribute(twoDimenList, allReward){
    let reward = int64Div(allReward, twoDimenList.length);

    for(member in twoDimenList){
        if(dpos.distribution[member[0]] === undefined){
            dpos.distribution[member[0]] = reward;
        }
        else{
            dpos.distribution[member[0]] = int64Add(dpos.distribution[member[0]], reward);
        }
    }

    let left = int64Mod(allReward, twoDimenList.length);
    dpos.distribution[twoDimenList[0][0]] = int64Add(dpos.distribution[member[0]], left);
}

function rewardDistribution(){
    dposInit();

    let rewards = int64Sub(dpos.balance, dpos.allStake);
    if(rewards === '0'){
        return;
    }

    let validators      = dpos.validatorCandidates.slice(0, validatorSetSize);
    let validatorReward = (rewards * 5) / 10;
    distribute(validators, validatorReward);

    let nodeReward = (rewards * 4) / 10;
    distribute(dpos.validatorCandidates, nodeReward);

    let kols      = dpos.kolCandidates.slice(0, kolSetSize);
    let kolReward = rewards / 10;
    distribute(kols, kolReward);

    let left = rewards % 10;
    dpos.distribution[validators[0][0]] = int64Add(dpos.distribution[validators[0][0]], left);
}

function query(input_str){
    let input  = JSON.parse(input_str);

    let result = {};
    if(input.method === 'getValidators'){
        result.current_validators = getValidators();
    }
    else if(input.method === 'getCandidates'){
        result.current_candidates = storageLoad(validatorCandidatesKey);
    }
    else{
       	throw '<unidentified operation type>';
    }

    log(result);
    return JSON.stringify(result);
}

function main(input_str){
    rewardDistribution();

    let input = JSON.parse(input_str);
    let params = input.params;

    if(input.method === 'apply'){
        apply(params.type);
    }
    else if(input.method === 'approveIn'){
	    approveIn(params.type, params.address);
    }
    else if(input.method === 'vote'){
	    vote(params.type, params.address);
    }
    else if(input.method === 'abolish'){
    	abolish(params.type, params.address, params.proof);
    }
    else if(input.method === 'approveOut'){
    	approveOut(params.type, params.address);
    }
    else if(input.method === 'withdraw'){
    	withdraw(params.type);
    }
    else{
        throw '<undidentified operation type>';
    }
}

function init(input_str){

    let committee = JSON.parse(input_str);
    for(member in committee){
        assert(addressCheck(member) === true, 'Committee member(' + member + ') is not valid adress.');
    }
    saveObj(committeeKey, committee);

    let validators = getValidators();
    assert(validators !== false, 'Get validators failed.');

    let candidates = validators.sort(doubleSort);
    saveObj(validatorCandidatesKey, candidates);

    let balance = getBalance();
    assert(balance !== false, 'Faild to get account balance.');

    let reward= {};
    reward.allStake     = balance;
    reward.distribution = {};
    saveObj(rewardKey, reward);

    return true;
}
